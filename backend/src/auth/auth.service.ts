import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';

@Injectable()
export class AuthService {
  constructor(private readonly dataSource: DataSource, private readonly jwt: JwtService) {}

  async login(email: string, password: string) {
    const rows = await this.dataSource.query(
      'SELECT id_usuario, email, password_hash, rol, estado FROM usuarios WHERE LOWER(email) = LOWER($1)',
      [email.trim()],
    );
    const user = rows[0];
    if (!user || user.estado !== 1 || !(await bcrypt.compare(password, user.password_hash))) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }
    const payload = { sub: user.id_usuario, email: user.email, rol: user.rol };
    return { accessToken: await this.jwt.signAsync(payload), usuario: { id: user.id_usuario, email: user.email, rol: user.rol } };
  }
}
