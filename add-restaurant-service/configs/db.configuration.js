import mongoose from "mongoose";

let cachedConnection = null;

export const dbConnection = async () => {
    if (cachedConnection && mongoose.connection.readyState === 1) {
        return cachedConnection;
    }

    try{
        mongoose.connection.on('error', ()=>{
            console.error(`Mongo DB | Error de conexión`);
        });
        mongoose.connection.on('connecting', ()=>{
            console.log(`Mongo DB | Intentando conectar a mongo DB`);
        });
        mongoose.connection.on('connected', ()=>{
            console.log(`Mongo DB | Conectado a mongo DB`);
        });
        mongoose.connection.on('open', ()=>{
            console.log(`Mongo DB | Conectado a la base de datos`);
        });
        mongoose.connection.on('reconnected', ()=>{
            console.log(`Mongo DB | Reconectando a mongo DB`);
        });
        mongoose.connection.on('disconnected', ()=>{
            console.log(`Mongo DB | Desconectado de mongo DB`);
        });
        cachedConnection = await mongoose.connect(process.env.URI_MONGODB, {
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 10,
        });
        return cachedConnection;
    }catch(err){
        console.error(`DebuggersEats - Error al conectar la db: ${err.message}`);
        cachedConnection = null;
        throw err;
    }//try-cath
};//Funcion para conexion a la base de datos.