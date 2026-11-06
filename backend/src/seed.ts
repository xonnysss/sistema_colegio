import 'reflect-metadata';
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { Client } from 'pg';

async function seed() {
  const client = new Client({
    host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USERNAME ?? 'postgres', password: process.env.DB_PASSWORD ?? '123456', database: process.env.DB_DATABASE ?? 'colegiobd',
  });
  await client.connect();
  const email = process.env.ADMIN_EMAIL ?? 'admin@marcoschool.bo';
  const password = process.env.ADMIN_PASSWORD ?? 'Admin2026';
  const resetPassword = process.env.ADMIN_RESET_PASSWORD === 'true';
  const existing = await client.query('SELECT id_usuario FROM usuarios WHERE LOWER(email)=LOWER($1)', [email]);
  if (!existing.rowCount) {
    await client.query('INSERT INTO usuarios (email, password_hash, rol) VALUES ($1,$2,$3)', [email, await bcrypt.hash(password, 10), 'ADMIN']);
    console.log(`Administrador creado: ${email}`);
  } else if (resetPassword) {
    await client.query('UPDATE usuarios SET password_hash=$1, rol=$2, estado=1 WHERE id_usuario=$3', [await bcrypt.hash(password, 10), 'ADMIN', existing.rows[0].id_usuario]);
    console.log(`Contraseña restablecida para: ${email}`);
  } else {
    console.log('El administrador ya existe; no se modificó. Usa ADMIN_RESET_PASSWORD=true para restablecerlo explícitamente.');
  }
  await client.end();
}
void seed();
