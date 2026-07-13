'use strict';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { hash } from '@node-rs/bcrypt';
import User from '../src/user.model.js';
import { corsOptions } from './cors.configuration.js';
import { helmetOptions } from './helmet.configuration.js';
import { dbConnection } from './db.configuration.js';
import { requestLimit } from './rateLimit.configuration.js';
import { errorHandler } from '../middlewares/handle-errors.js';
import authRoutes from '../src/user.routes.js';
import { swaggerSpec, swaggerUi } from "./documentation.js";

const BASE_PATH = '/debuggersEatsAdmin/v1';

const routes = (app) => {
    app.get('/', (req, res) => {
        res.status(200).json({
            success: true,
            service: 'Debuggers Eats Authentication API',
            version: '1.0.0',
            status: 'online',
            message: 'API en línea. Usa los endpoints documentados abajo.',
            endpoints: {
                health: `${BASE_PATH}/health`,
                auth: `${BASE_PATH}/auth`,
                docs: `${BASE_PATH}/api-docs`
            },
            timestamp: new Date().toISOString()
        });
    });

    app.use(`${BASE_PATH}/auth`, authRoutes);
    app.use(`${BASE_PATH}/api-docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    app.get(`${BASE_PATH}/health`, (req, res) => {
        res.status(200).json({
            status: 'Healthy',
            timeStamp: new Date().toISOString(),
            service: 'Debuggers Eats Admin Server'
        });
    });

    app.use((req, res) => {
        res.status(404).json({
            success: false,
            message: 'Endpoint no encontrado'
        });
    });
};

const middlewares = (app) => {
    app.use(cors(corsOptions));
    app.use(helmet(helmetOptions));
    app.use(morgan('dev'));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(requestLimit);
};


const seederAdmin = async () => {
    try {
        const adminExists = await User.findOne({ username: 'admin' });
        if (adminExists) {
            console.log('Usuario administrador ya existe');
        } else {
            const hashedPassword = await hash('Admin123!DebuggersEats', 10);
            const admin = new User({
                firstName: 'Administrador',
                surname: 'Principal',
                email: 'admin@debuggerseats.com',
                phone: '42459699',
                username: 'admin',
                password: hashedPassword,
                role: 'ADMIN_ROLE',
                isActive: true
            });
            await admin.save();
            console.log('Usuario administrador creado exitosamente');
        }
    } catch (e) {
        console.error('Error al crear administradores:', e.message);
    }
};

let seeded = false;

// Construye y devuelve la app de Express (síncrono, apto para exportar en Vercel)
export const buildApp = () => {
    const app = express();
    app.set('trust proxy', 1);

    middlewares(app);

    // Garantiza conexión a Mongo (cacheada) antes de resolver cualquier ruta
    app.use(async (req, res, next) => {
        try {
            await dbConnection();
            if (!seeded) {
                seeded = true;
                seederAdmin().catch(e => console.error('Seeder error:', e.message));
            }
            next();
        } catch (e) {
            res.status(503).json({
                success: false,
                message: 'No se pudo conectar a la base de datos'
            });
        }
    });

    routes(app);
    app.use(errorHandler);

    return app;
};