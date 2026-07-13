import dotenv from 'dotenv';
import { buildApp } from './configs/app.js';

dotenv.config();

const app = buildApp();

// Solo levanta un servidor "tradicional" en local. En Vercel (VERCEL=1)
// simplemente exportamos la app para que @vercel/node la invoque.
if (!process.env.VERCEL) {
    const PORT = process.env.PORT || 3013;
    app.listen(PORT, () => {
        console.log(`Debuggers Eats Server running on port: ${PORT}`);
        console.log(`Health check: http://localhost:${PORT}/debuggersEatsAdmin/v1/health`);
        console.log(`Swagger docs: http://localhost:${PORT}/debuggersEatsAdmin/v1/api-docs`);
    });
}

export default app;