export class Session {
  private _accessToken = "";
  private _expireAt = 0;

  get accessToken(): string {
    return this._accessToken;
  }

  set(accessToken: string, expireIn: number): void {
    this._accessToken = accessToken;
    this._expireAt = Date.now() + (expireIn - 60) * 1000;
  }

  hasValidToken(): boolean {
    return !!this._accessToken && Date.now() < this._expireAt;
  }

  reset(): void {
    this._accessToken = "";
    this._expireAt = 0;
  }
}
