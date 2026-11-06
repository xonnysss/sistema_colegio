import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly dataSource: DataSource) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET ?? 'solo_desarrollo_cambiar_en_produccion',
    });
  }

  async validate(payload: { sub: number; email: string; rol: string }) {
    const rows = await this.dataSource.query('SELECT id_usuario,email,rol FROM usuarios WHERE id_usuario=$1 AND estado=1', [payload.sub]);
    if (!rows[0]) throw new UnauthorizedException('La cuenta no está activa');
    return { sub: rows[0].id_usuario, email: rows[0].email, rol: rows[0].rol };
  }
}
