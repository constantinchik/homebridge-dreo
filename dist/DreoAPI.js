"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const md5_1 = __importDefault(require("crypto-js/md5"));
const reconnecting_websocket_1 = __importDefault(require("reconnecting-websocket"));
const ws_1 = __importDefault(require("ws"));
// User agent string for API requests
const ua = 'dreo/2.8.1 (iPhone; iOS 18.0.0; Scale/3.00)';
// Follows same request structure as the mobile app
class DreoAPI {
    constructor(platform) {
        var _a, _b;
        this.log = platform.log;
        this.email = (_a = platform.config.options) === null || _a === void 0 ? void 0 : _a.email;
        this.password = (_b = platform.config.options) === null || _b === void 0 ? void 0 : _b.password;
        this.server = 'us';
        this.access_token = '';
    }
    // Get authentication token
    async authenticate() {
        let auth;
        await axios_1.default.post('https://app-api-' + this.server + '.dreo-tech.com/api/oauth/login', {
            'client_id': 'd8a56a73d93b427cad801116dc4d3188',
            'client_secret': '2ac9b179f7e84be58bb901d6ed8bf374',
            'email': this.email,
            'encrypt': 'ciphertext',
            'grant_type': 'email-password',
            'himei': '463299817f794e52a228868167df3f34',
            'password': (0, md5_1.default)(this.password).toString(),
            'scope': 'all',
        }, {
            params: {
                'timestamp': Date.now(),
            },
            headers: {
                'ua': ua,
                'lang': 'en',
                'content-type': 'application/json; charset=UTF-8',
                'accept-encoding': 'gzip',
                'user-agent': 'okhttp/4.9.1',
            },
        })
            .then((response) => {
            const payload = response.data;
            if (payload.data && payload.data.access_token) {
                // Auth success
                auth = payload.data;
                this.access_token = auth.access_token;
            }
            else {
                this.log.error('error retrieving token:', payload.msg);
                auth = undefined;
            }
        })
            .catch((error) => {
            this.log.error('error retrieving token:', error);
            auth = undefined;
        });
        return auth;
    }
    // Return device list
    async getDevices() {
        let devices;
        await axios_1.default.get('https://app-api-' + this.server + '.dreo-tech.com/api/app/index/family/room/devices', {
            params: {
                'timestamp': Date.now(),
            },
            headers: {
                'authorization': 'Bearer ' + this.access_token,
                'ua': ua,
                'lang': 'en',
                'accept-encoding': 'gzip',
                'user-agent': 'okhttp/4.9.1',
            },
        })
            // Catch and log errors
            .then((response) => {
            devices = response.data.data.list;
        })
            .catch((error) => {
            this.log.error('error retrieving device list:', error);
            devices = undefined;
        });
        return devices;
    }
    // Used to initialize power state, speed values on boot
    async getState(sn) {
        let state;
        await axios_1.default.get('https://app-api-' + this.server + '.dreo-tech.com/api/user-device/device/state', {
            params: {
                'deviceSn': sn,
                'timestamp': Date.now(),
            },
            headers: {
                'authorization': 'Bearer ' + this.access_token,
                'ua': ua,
                'lang': 'en',
                'accept-encoding': 'gzip',
                'user-agent': 'okhttp/4.9.1',
            },
        })
            .then((response) => {
            state = response.data.data.mixed;
        })
            .catch((error) => {
            this.log.error('error retrieving device state:', error);
            state = undefined;
        });
        return state;
    }
    // Open websocket for outgoing fan commands, websocket will auto-reconnect if a connection error occurs
    // Websocket is also used to monitor incoming state changes from hardware controls
    async startWebSocket() {
        // open websocket
        const url = 'wss://wsb-' + this.server + '.dreo-tech.com/websocket?accessToken=' + this.access_token + '&timestamp=' + Date.now();
        this.ws = new reconnecting_websocket_1.default(url, [], { WebSocket: ws_1.default });
        this.ws.addEventListener('error', error => {
            this.log.debug('WebSocket', error);
        });
        this.ws.addEventListener('open', () => {
            this.log.debug('WebSocket Opened');
        });
        this.ws.addEventListener('close', () => {
            this.log.debug('WebSocket Closed');
        });
        // Keep connection open by sending empty packet every 15 seconds
        setInterval(() => this.ws.send('2'), 15000);
    }
    // Allow devices to add event listeners to the WebSocket
    addEventListener(event, listener) {
        this.ws.addEventListener(event, listener);
    }
    // Send control commands to device (fan speed, power, etc)
    control(sn, command) {
        this.ws.send(JSON.stringify({
            'deviceSn': sn,
            'method': 'control',
            'params': command,
            'timestamp': Date.now(),
        }));
    }
}
exports.default = DreoAPI;
//# sourceMappingURL=DreoAPI.js.map