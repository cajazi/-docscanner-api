"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    PORT: zod_1.z.coerce.number().int().positive().default(4000),
    HOST: zod_1.z.string().default('0.0.0.0'),
});
exports.env = envSchema.parse(process.env);
//# sourceMappingURL=env.js.map