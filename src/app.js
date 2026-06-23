"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = buildApp;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const engineRoutes_1 = require("./routes/engineRoutes");
async function buildApp() {
    const app = (0, fastify_1.default)({ logger: true });
    await app.register(cors_1.default, {
        origin: true,
    });
    app.get('/health', async () => ({
        status: 'ok',
        service: 'docscanner-api',
    }));
    await app.register(engineRoutes_1.engineRoutes);
    return app;
}
//# sourceMappingURL=app.js.map