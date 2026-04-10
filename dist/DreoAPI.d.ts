import type { DreoPlatform } from './platform';
export default class DreoAPI {
    private readonly email;
    private readonly password;
    private readonly log;
    private access_token;
    private ws;
    server: string;
    constructor(platform: DreoPlatform);
    authenticate(): Promise<any>;
    getDevices(): Promise<any>;
    getState(sn: any): Promise<any>;
    startWebSocket(): Promise<void>;
    addEventListener(event: any, listener: any): void;
    control(sn: any, command: any): void;
}
//# sourceMappingURL=DreoAPI.d.ts.map