"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const env_1 = require("./config/env");
async function main() {
    const app = await (0, app_1.buildApp)();
    await app.listen({
        host: env_1.env.HOST,
        port: env_1.env.PORT,
    });
}
main();
//# sourceMappingURL=server.js.map