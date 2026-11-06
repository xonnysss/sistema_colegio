'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('expirada') === '1') {
        setSessionExpired(true);
      }
    }
    if (localStorage.getItem('token')) router.replace('/dashboard');
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('token', data.accessToken);
      localStorage.setItem('usuario', JSON.stringify(data.usuario));
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="login-card">
        <span className="eyebrow">GESTIÓN EDUCATIVA</span>
        <h1>Marco School</h1>
        <p>Ingresa con tu cuenta institucional.</p>
        {sessionExpired && (
          <div className="notice" style={{ marginBottom: 16, backgroundColor: '#fff3cd', color: '#856404', borderLeftColor: '#ffeeba' }}>
            Tu sesión venció. Inicia sesión de nuevo.
          </div>
        )}
        <label>
          Correo electrónico
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="correo@colegio.bo"
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button disabled={loading}>{loading ? 'Ingresando…' : 'Ingresar'}</button>
      </form>
    </main>
  );
}
