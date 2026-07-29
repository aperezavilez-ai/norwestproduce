import Link from "next/link";

export default function MexicoModule() {
  return (
    <main className="module-placeholder">
      <section>
        <div className="module-badge">MX</div>
        <p className="eyebrow">Operación nacional</p>
        <h1>Módulo México</h1>
        <p>Este espacio se mantiene independiente. Ningún movimiento registrado en USA aparecerá aquí.</p>
        <div className="placeholder-box">
          <strong>Sistema nacional conservado por separado</strong>
          <span>Continuaremos este módulo desde su propia base y flujo operativo.</span>
        </div>
        <Link href="/empresas" className="text-link">← Cambiar de empresa</Link>
      </section>
    </main>
  );
}
