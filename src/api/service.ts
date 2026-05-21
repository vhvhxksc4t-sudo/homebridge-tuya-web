import { Logger } from "homebridge";
import axios from "axios";
import crypto from "crypto";
import { Session } from "./session";
import {
  DeviceState,
  HomeAssistantDeviceTypes,
  HomeAssistantDeviceType,
  TuyaApiMethod,
  TuyaApiPayload,
  TuyaDevice,
  TuyaDeviceType,
  CoverState,
} from "./response";
import {
  AuthenticationError,
  RateLimitError,
  UnsupportedOperationError,
} from "../errors";
import { DeviceOfflineError } from "../errors/DeviceOfflineError";

const REGION_URLS: Record<string, string> = {
  cn: "https://openapi.tuyacn.com",
  us: "https://openapi.tuyaus.com",
  eu: "https://openapi.tuyaeu.com",
  in: "https://openapi.tuyain.com",
};

// Tuya category code → plugin device type
// Source: Tuya IoT Platform category documentation
const CATEGORY_MAP: Record<string, TuyaDeviceType> = {
  kg: "switch",
  cz: "outlet",
  pc: "outlet",
  dj: "light",
  dd: "dimmer",
  xdd: "light",
  fwd: "light",
  dc: "light",
  tgq: "dimmer",
  tgkg: "switch",
  fs: "fan",
  fsd: "fan",
  cl: "cover",
  clkg: "cover",
  wm: "cover",
  wmc: "cover",
  wk: "climate",
  wkf: "climate",
  qt: "climate",
  wsdcg: "temperature_sensor",
  ldcg: "temperature_sensor",
  ckmkzq: "garage",
  mcs: "window",
};

// DP code candidates in priority order
const DP_SWITCH = ["switch_1", "switch_led", "switch"];
const DP_BRIGHTNESS = ["bright_value_v2", "bright_value"];
const DP_COLOR_TEMP = ["temp_value_v2", "temp_value"];
const DP_COLOR = ["colour_data_v2", "colour_data"];
const DP_FAN_SPEED = ["fan_speed_enum", "fan_speed"];

interface IotDevice {
  id: string;
  name: string;
  category: string;
  online: boolean;
  status: { code: string; value: unknown }[];
}

interface IotResponse<T> {
  result: T;
  success: boolean;
  code?: number;
  msg?: string;
  t: number;
}

interface IotTokenResult {
  access_token: string;
  expire_time: number;
  refresh_token: string;
  uid: string;
}

interface IotDeviceListResult {
  devices: IotDevice[];
  last_row_key: string;
  has_more: boolean;
}

export class TuyaWebApi {
  private session = new Session();
  private baseUrl: string;
  private deviceDpCodes = new Map<string, Set<string>>();

  constructor(
    private accessId: string,
    private accessSecret: string,
    region: string,
    private log?: Logger,
  ) {
    this.baseUrl = REGION_URLS[region] ?? REGION_URLS.us;
    this.log?.debug("Using Tuya IoT Platform base URL: %s", this.baseUrl);
  }

  // ─── Auth ────────────────────────────────────────────────────────────────────

  public async getOrRefreshToken(): Promise<void> {
    if (this.session.hasValidToken()) {return;}

    if (!this.accessId) {throw new AuthenticationError("No accessId configured");}
    if (!this.accessSecret)
      {throw new AuthenticationError("No accessSecret configured");}

    const path = "/v1.0/token?grant_type=1";
    const t = Date.now().toString();
    const contentHash = this.sha256("");
    const stringToSign = ["GET", contentHash, "", path].join("\n");
    // Token requests do not include access_token in the signature string
    const signStr = this.accessId + t + stringToSign;

    const headers = {
      client_id: this.accessId,
      sign: this.hmacSHA256(this.accessSecret, signStr),
      t,
      sign_method: "HMAC-SHA256",
    };

    const res = await axios.get<IotResponse<IotTokenResult>>(
      `${this.baseUrl}${path}`,
      { headers },
    );

    if (!res.data.success || !res.data.result?.access_token) {
      throw new AuthenticationError(
        `Token request failed: ${JSON.stringify(res.data)}`,
      );
    }

    const { access_token, expire_time } = res.data.result;
    this.session.set(access_token, expire_time);
    this.log?.debug("Tuya token acquired, expires in %ds", expire_time);

    setTimeout(
      () => {
        void this.getOrRefreshToken();
      },
      (expire_time - 60) * 1000,
    );
  }

  // ─── Device discovery ────────────────────────────────────────────────────────

  public async discoverDevices(): Promise<TuyaDevice[]> {
    this.ensureToken();
    const devices: TuyaDevice[] = [];
    let lastRowKey = "";
    let hasMore = true;

    while (hasMore) {
      const path = `/v1.0/iot-01/associated-users/devices?last_row_key=${lastRowKey}&page_size=50`;
      const res = await this.get<IotResponse<IotDeviceListResult>>(path);

      if (!res.success) {
        throw new Error(`Device discovery failed: ${JSON.stringify(res)}`);
      }

      for (const d of res.result.devices) {
        this.deviceDpCodes.set(d.id, new Set(d.status.map((s) => s.code)));
        devices.push(this.mapDevice(d));
      }

      hasMore = res.result.has_more ?? false;
      lastRowKey = res.result.last_row_key ?? "";
    }

    this.log?.debug("Discovered %d devices", devices.length);
    return devices;
  }

  public async getAllDeviceStates(): Promise<TuyaDevice[]> {
    return this.discoverDevices();
  }

  // ─── Device state ────────────────────────────────────────────────────────────

  public async getDeviceState(deviceId: string): Promise<DeviceState> {
    this.ensureToken();
    const path = `/v1.0/devices/${deviceId}/status`;
    const res =
      await this.get<IotResponse<{ code: string; value: unknown }[]>>(path);

    if (!res.success) {
      if (res.code === 2406) {throw new DeviceOfflineError();}
      throw new Error(`Get device state failed: ${JSON.stringify(res)}`);
    }

    this.deviceDpCodes.set(deviceId, new Set(res.result.map((s) => s.code)));
    return { ...this.statusToDeviceState(res.result), online: true };
  }

  public async setDeviceState<Method extends TuyaApiMethod>(
    deviceId: string,
    method: Method,
    payload: TuyaApiPayload<Method>,
  ): Promise<void> {
    this.ensureToken();
    const commands = this.methodToCommands(
      deviceId,
      method,
      payload,
    );

    if (commands.length === 0) {
      throw new UnsupportedOperationError(
        "Unsupported method",
        `No DP mapping for method: ${method}`,
      );
    }

    const path = `/v1.0/devices/${deviceId}/commands`;
    const res = await this.post<IotResponse<boolean>>(path, { commands });

    if (!res.success) {
      if (res.code === 2406) {throw new DeviceOfflineError();}
      if (res.code === 2012)
        {throw new RateLimitError("Requesting too quickly.", String(res.code));}
      if (res.code === 2009)
        {throw new UnsupportedOperationError(
          "Unsupported Operation",
          "The action is not valid for this device.",
        );}
      throw new Error(`Set device state failed: ${JSON.stringify(res)}`);
    }
  }

  // ─── HTTP helpers ─────────────────────────────────────────────────────────────

  private buildHeaders(
    method: string,
    path: string,
    body = "",
  ): Record<string, string> {
    const t = Date.now().toString();
    const contentHash = this.sha256(body);
    const stringToSign = [method, contentHash, "", path].join("\n");
    const accessToken = this.session.accessToken;
    const signStr = this.accessId + accessToken + t + stringToSign;
    return {
      client_id: this.accessId,
      access_token: accessToken,
      sign: this.hmacSHA256(this.accessSecret, signStr),
      t,
      sign_method: "HMAC-SHA256",
    };
  }

  private async get<T>(path: string): Promise<T> {
    const headers = this.buildHeaders("GET", path);
    const res = await axios.get<T>(`${this.baseUrl}${path}`, { headers });
    return res.data;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const bodyStr = JSON.stringify(body);
    const headers = this.buildHeaders("POST", path, bodyStr);
    const res = await axios.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { ...headers, "Content-Type": "application/json" },
    });
    return res.data;
  }

  private ensureToken(): void {
    if (!this.session.hasValidToken()) {
      throw new Error("No valid token");
    }
  }

  // ─── Signing ──────────────────────────────────────────────────────────────────

  private hmacSHA256(secret: string, str: string): string {
    return crypto
      .createHmac("sha256", secret)
      .update(str)
      .digest("hex")
      .toUpperCase();
  }

  private sha256(str: string): string {
    return crypto.createHash("sha256").update(str).digest("hex").toLowerCase();
  }

  // ─── Translation helpers ──────────────────────────────────────────────────────

  private pickCode(deviceId: string, candidates: string[]): string {
    const codes = this.deviceDpCodes.get(deviceId);
    if (codes) {
      const found = candidates.find((c) => codes.has(c));
      if (found) {return found;}
    }
    return candidates[0];
  }

  private methodToCommands(
    deviceId: string,
    method: TuyaApiMethod,
    payload: TuyaApiPayload<TuyaApiMethod>,
  ): { code: string; value: unknown }[] {
    const codes = this.deviceDpCodes.get(deviceId);

    switch (method) {
      case "turnOnOff": {
        const { value } = payload as { value: 0 | 1 };
        const boolValue = value === 1;
        // Covers use the 'control' DP; switches/outlets/lights use switch_1 etc.
        if (codes?.has("control")) {
          return [{ code: "control", value: boolValue ? "open" : "close" }];
        }
        return [{ code: this.pickCode(deviceId, DP_SWITCH), value: boolValue }];
      }
      case "brightnessSet": {
        const { value } = payload as { value: number };
        return [{ code: this.pickCode(deviceId, DP_BRIGHTNESS), value }];
      }
      case "colorTemperatureSet": {
        const { value } = payload as { value: number };
        return [{ code: this.pickCode(deviceId, DP_COLOR_TEMP), value }];
      }
      case "colorSet": {
        const { color } = payload as {
          color: { hue: number; saturation: number; brightness: number };
        };
        const code = this.pickCode(deviceId, DP_COLOR);
        // v2 uses object; v1 uses JSON string
        const colorValue = code.endsWith("_v2")
          ? { h: color.hue, s: color.saturation, v: color.brightness }
          : JSON.stringify({
              h: color.hue,
              s: color.saturation,
              v: color.brightness,
            });
        return [{ code, value: colorValue }];
      }
      case "windSpeedSet": {
        const { value } = payload as { value: number };
        return [{ code: this.pickCode(deviceId, DP_FAN_SPEED), value }];
      }
      case "temperatureSet": {
        const { value } = payload as { value: number };
        return [{ code: "temp_set", value }];
      }
      case "modeSet": {
        const { value } = payload as { value: string };
        return [{ code: "mode", value }];
      }
      case "startStop": {
        if (codes?.has("control")) {
          return [{ code: "control", value: "stop" }];
        }
        return [{ code: this.pickCode(deviceId, DP_SWITCH), value: false }];
      }
      default:
        return [];
    }
  }

  private statusToDeviceState(
    status: { code: string; value: unknown }[],
  ): DeviceState {
    const state: DeviceState = {};

    for (const dp of status) {
      switch (dp.code) {
        case "switch_1":
        case "switch_led":
        case "switch":
          state.state = dp.value as boolean;
          break;
        case "bright_value_v2":
        case "bright_value":
          state.brightness = dp.value as number;
          break;
        case "temp_value_v2":
        case "temp_value":
          state.color_temp = dp.value as number;
          break;
        case "colour_data_v2":
        case "colour_data": {
          const raw = dp.value;
          let obj: { h: number; s: number; v: number } | null = null;
          if (typeof raw === "object" && raw !== null) {
            obj = raw as { h: number; s: number; v: number };
          } else if (typeof raw === "string") {
            try {
              obj = JSON.parse(raw) as { h: number; s: number; v: number };
            } catch {
              // ignore malformed colour_data
            }
          }
          if (obj) {
            state.color = {
              hue: String(obj.h),
              saturation: String(obj.s),
              brightness: String(obj.v),
            };
          }
          break;
        }
        case "work_mode":
          // Tuya uses 'colour' (UK); map to our ColorModes
          state.color_mode =
            dp.value === "colour" ? "colour" : (dp.value as "white");
          break;
        case "fan_speed_enum":
        case "fan_speed":
          state.speed = dp.value as number;
          break;
        case "mode":
          state.mode = dp.value as "cold" | "hot" | "wind" | "auto";
          break;
        case "temp_current":
          state.current_temperature = dp.value as number;
          break;
        case "temp_set":
          state.temperature = dp.value as number;
          break;
        case "control":
          // Cover: last-sent command → map to numeric CoverState for characteristic compat
          if (dp.value === "open") {state.state = CoverState.Opening;}
          else if (dp.value === "close") {state.state = CoverState.Closing;}
          else if (dp.value === "stop") {state.state = CoverState.Stopped;}
          break;
        case "percent_state":
          // Cover current position (0=closed, 100=open)
          {
            const pct = dp.value as number;
            if (pct >= 100) {state.state = CoverState.Opening;}
            else if (pct <= 0) {state.state = CoverState.Closing;}
            else {state.state = CoverState.Stopped;}
          }
          break;
        case "support_stop":
          state.support_stop = dp.value as boolean;
          break;
      }
    }

    return state;
  }

  private mapDevice(d: IotDevice): TuyaDevice {
    const devType: TuyaDeviceType = CATEGORY_MAP[d.category] ?? "switch";
    const haType: HomeAssistantDeviceType = (
      HomeAssistantDeviceTypes as readonly string[]
    ).includes(devType)
      ? (devType as HomeAssistantDeviceType)
      : "switch";

    return {
      id: d.id,
      name: d.name,
      dev_type: devType,
      ha_type: haType,
      data: {
        ...this.statusToDeviceState(d.status),
        online: d.online,
      },
    };
  }
}
