import User from './user.model.js';
import { hash, verify } from '@node-rs/bcrypt';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import { sendActivationEmail, sendWelcomeEmail, sendPasswordResetEmail, sendPasswordChangedEmail } from '../helpers/email.helper.js';

export const createUserRecord = async ({ userData }) => {
    const { restaurantId, ...rest } = userData;

    const hashedPassword = await hash(rest.password, 10);
    const activationToken = uuidv4();
    const user = new User({
        ...rest,
        password: hashedPassword,
        activationToken,
        isActive: false
    });
    await user.save();

    //Asigna un restaurante si es RES_ADMIN_ROLE
    if (rest.role === 'RES_ADMIN_ROLE' && restaurantId) {
        const restaurant = await mongoose.connection.collection('restaurants').findOne({
            _id: new mongoose.Types.ObjectId(restaurantId)
        });

        if (!restaurant) {
            await User.deleteOne({ _id: user._id });
            const e = new Error('El restaurante especificado no existe');
            e.statusCode = 404;
            throw e;
        }

        if (restaurant.assignedAdmin) {
            await User.deleteOne({ _id: user._id });
            const e = new Error('Este restaurante ya tiene un administrador asignado');
            e.statusCode = 409;
            throw e;
        }

        await mongoose.connection.collection('restaurants').updateOne(
            { _id: new mongoose.Types.ObjectId(restaurantId) },
            { $set: { assignedAdmin: new mongoose.Types.ObjectId(user._id) } }
        );
    }

    try {
        await sendActivationEmail(user.email, activationToken, user.firstName);
    } catch (err) {
        console.error('Error al enviar email de activación:', err);
    }

    const userObject = user.toObject();

    delete userObject.password;
    delete userObject.activationToken;
    return userObject;
};

//Auto-registro público de clientes
export const registerUserRecord = async ({ userData }) => {
    const hashedPassword = await hash(userData.password, 10);
    const activationToken = uuidv4();
    const user = new User({
        ...userData,
        password: hashedPassword,
        activationToken,
        role: 'USER_ROLE',
        isActive: false
    });
    await user.save();

    try {
        await sendActivationEmail(user.email, activationToken, user.firstName);
    } catch (err) {
        console.error('Error al enviar email de activación:', err);
    }

    const userObject = user.toObject();

    delete userObject.password;
    delete userObject.activationToken;
    return userObject;
};

export const activateUserAccount = async (token) => {
    const user = await User.findOne({ activationToken: token });

    if (!user) {
        throw new Error('Token de activación inválido o expirado');
    }

    if (user.isActive) {
        throw new Error('La cuenta ya está activada');
    }

    user.isActive = true;
    user.activationToken = undefined;
    await user.save();

    return user;
};

export const loginUser = async (username, password) => {
    const user = await User.findOne({
        $or: [{ username }, { email: username }]
    });

    if (!user) {
        throw new Error('Credenciales incorrectas');
    }

    if (!user.isActive) {
        throw new Error('Cuenta no activada. Por favor revisa tu correo electrónico');
    }

    const isPasswordValid = await verify(password, user.password);

    if (!isPasswordValid) {
        throw new Error('Credenciales incorrectas');
    }

    const isFirstLogin = user.createdAt.getTime() === user.updatedAt.getTime();

    if (isFirstLogin) {
        try {
            await sendWelcomeEmail(user.email, user.firstName, user.username);
        } catch (error) {
            console.error('Error al enviar email de bienvenida:', error);
        }
    }

    const userObject = user.toObject();
    delete userObject.password;
    delete userObject.activationToken;

    if (userObject.role === 'RES_ADMIN_ROLE') {
        const restaurant = await mongoose.connection//relaciona restaurants con user
            .collection('restaurants')
            .findOne({ assignedAdmin: new mongoose.Types.ObjectId(userObject._id) });

        if (restaurant) {
            userObject.restaurantId = restaurant._id.toString();
        }
    }

    return userObject;
};

export const changePassword = async (userId, currentPassword, newPassword) => {
    const user = await User.findById(userId);

    if (!user) {
        throw new Error('Usuario no encontrado');
    }

    const isPasswordValid = await verify(currentPassword, user.password);

    if (!isPasswordValid) {
        throw new Error('Contraseña actual incorrecta');
    }

    const hashedPassword = await hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    await sendPasswordChangedEmail(user.email, user.firstName);
    return { message: 'Contraseña actualizada exitosamente' };
};

export const requestPasswordReset = async (email) => {
    const user = await User.findOne({ email });

    if (!user) {
        throw new Error('No existe un usuario con ese correo electrónico');
    }

    if (!user.isActive) {
        throw new Error('La cuenta no está activada');
    }

    const resetToken = uuidv4();
    const resetExpires = new Date(Date.now() + 3600000);
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetExpires;
    await user.save();

    try {
        await sendPasswordResetEmail(user.email, resetToken, user.firstName);
    } catch (emailError) {
        console.error('Error al enviar email de reset:', emailError);
    }

    return { message: 'Se ha enviado un correo con instrucciones para restablecer tu contraseña' };
};

export const resetPassword = async (token, newPassword) => {
    const user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
        throw new Error('Token de recuperación inválido o expirado');
    }

    const hashedPassword = await hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();
    await sendPasswordChangedEmail(user.email, user.firstName);
    return { message: 'Contraseña restablecida exitosamente' };
};

//Edición de perfil propio
export const updateProfileRecord = async (userId, profileData) => {
    const { firstName, surname, phone, email, username } = profileData;

    if (email) {
        const existing = await User.findOne({ email, _id: { $ne: userId } });
        if (existing) {
            const e = new Error('El correo ya está registrado por otro usuario');
            e.statusCode = 409;
            throw e;
        }
    }

    if (username) {
        const existing = await User.findOne({ username, _id: { $ne: userId } });
        if (existing) {
            const e = new Error('El username ya está registrado por otro usuario');
            e.statusCode = 409;
            throw e;
        }
    }

    const updated = await User.findByIdAndUpdate(
        userId,
        { firstName, surname, phone, email, username },
        { new: true, runValidators: true }
    ).select('-password -activationToken -resetPasswordToken -resetPasswordExpires');

    if (!updated) {
        const e = new Error('Usuario no encontrado');
        e.statusCode = 404;
        throw e;
    }

    return updated;
};

//Gestión completa de usuarios
export const getAllUsersRecord = async () => {
    return User.find()
        .select('-password -activationToken -resetPasswordToken -resetPasswordExpires')
        .sort({ createdAt: -1 });
};

export const getUserByIdRecord = async (userId) => {
    const user = await User.findById(userId)
        .select('-password -activationToken -resetPasswordToken -resetPasswordExpires');

    if (!user) {
        const e = new Error('Usuario no encontrado');
        e.statusCode = 404;
        throw e;
    }

    return user;
};

export const toggleUserStatusRecord = async (userId) => {
    const user = await User.findById(userId);

    if (!user) {
        const e = new Error('Usuario no encontrado');
        e.statusCode = 404;
        throw e;
    }

    user.isActive = !user.isActive;
    await user.save();

    const userObject = user.toObject();
    delete userObject.password;
    delete userObject.activationToken;
    delete userObject.resetPasswordToken;
    delete userObject.resetPasswordExpires;

    return userObject;
};

export const deleteUserRecord = async (userId) => {
    const user = await User.findById(userId);

    if (!user) {
        const e = new Error('Usuario no encontrado');
        e.statusCode = 404;
        throw e;
    }

    let restaurantWarning = null;

    if (user.role === 'RES_ADMIN_ROLE') {
        const restaurantUpdate = await mongoose.connection.collection('restaurants').updateOne(
            { assignedAdmin: new mongoose.Types.ObjectId(userId) },
            { $set: { assignedAdmin: null } }
        );

        if (restaurantUpdate.matchedCount === 0) {
            restaurantWarning = 'El usuario no tenía restaurante asignado';
        } else {
            //Se desasignó correctamente, restaurante sigue existiendo
            restaurantWarning = 'El restaurante quedó sin administrador asignado. Puedes asignar uno nuevo';
        }
    }

    await User.deleteOne({ _id: userId });
    return {
        deleted: true,
        userId,
    };
};