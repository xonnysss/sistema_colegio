export const SCHOOL_CONFIG = {
  NOMBRE_COLEGIO: 'Marco School',
  PERIODOS_TOTALES: 4,
  NOTA_APROBACION: 51,
  NOTA_RIESGO: 61,
  MES_INICIO_PENSIONES: 2, // Febrero
  MES_FIN_PENSIONES: 11,   // Noviembre
};

export const MESES_NOMBRES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const MESES_CORTOS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

export function formatMoney(amount: number | string | null | undefined): string {
  const num = Number(amount ?? 0);
  if (isNaN(num)) return 'Bs 0,00';
  return new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(num);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const clean = String(dateStr).split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return dateStr;
}

export function formatNumber(val: number | string | null | undefined, decimals = 2): string {
  const num = Number(val ?? 0);
  if (isNaN(num)) return '—';
  return num.toLocaleString('es-BO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function calcularEdad(fechaNacimiento: string): number | null {
  if (!fechaNacimiento) return null;
  const nac = new Date(fechaNacimiento);
  if (isNaN(nac.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) {
    edad--;
  }
  return edad;
}

const UNIDADES = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const DECENAS = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const DIEZ_Y = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
const VEINTE_Y = ['veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function seccionEnLetras(num: number): string {
  if (num === 0) return '';
  if (num === 100) return 'cien';
  const c = Math.floor(num / 100);
  const resto = num % 100;
  let str = CENTENAS[c] ? CENTENAS[c] + ' ' : '';
  if (resto >= 10 && resto < 20) {
    str += DIEZ_Y[resto - 10];
  } else if (resto >= 20 && resto < 30) {
    str += VEINTE_Y[resto - 20];
  } else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    if (d > 0) {
      str += DECENAS[d];
      if (u > 0) str += ' y ' + UNIDADES[u];
    } else if (u > 0) {
      str += UNIDADES[u];
    }
  }
  return str.trim();
}

export function montoEnLetras(monto: number): string {
  const parteEntera = Math.floor(monto);
  const centavos = Math.round((monto - parteEntera) * 100);
  const centavosStr = String(centavos).padStart(2, '0') + '/100 bolivianos';

  if (parteEntera === 0) return `Cero ${centavosStr}`;
  if (parteEntera === 1000) return `Un mil ${centavosStr}`;

  let resultado = '';
  const miles = Math.floor(parteEntera / 1000);
  const unidades = parteEntera % 1000;

  if (miles > 0) {
    if (miles === 1) {
      resultado += 'un mil ';
    } else {
      resultado += seccionEnLetras(miles) + ' mil ';
    }
  }
  if (unidades > 0) {
    resultado += seccionEnLetras(unidades) + ' ';
  }

  resultado = resultado.trim();
  // Capitalizar primera letra
  resultado = resultado.charAt(0).toUpperCase() + resultado.slice(1);
  return `${resultado} ${centavosStr}`;
}
