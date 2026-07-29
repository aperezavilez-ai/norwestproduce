import Link from "next/link";

export default function CompanySelectorPage() {
  return (
    <main className="company-gateway">
      <div className="gateway-glow gateway-glow-one" />
      <div className="gateway-glow gateway-glow-two" />
      <section className="gateway-panel">
        <div className="brand-lockup gateway-brand-lockup">
          <img src="/norwest-logo.jpg?v=23" alt="Norwest Produce" width="1528" height="473" />
        </div>
        <p className="eyebrow">Sistema administrativo</p>
        <h1>Selecciona la operación</h1>
        <p className="gateway-copy">Cada empresa mantiene sus propios datos, folios, clientes, ventas y reportes.</p>
        <div className="company-grid">
          <Link href="/usa" className="company-card company-card-usa">
            <div className="flag-pill">USA</div>
            <div>
              <p className="company-kicker">Operación Estados Unidos</p>
              <h2>Norwest Produce LLC</h2>
              <p>Ventas, cargas, facturación y cartera en dólares.</p>
            </div>
            <span className="company-arrow">→</span>
          </Link>
          <Link href="/mexico" className="company-card company-card-mx">
            <div className="flag-pill">MX</div>
            <div>
              <p className="company-kicker">Operación nacional</p>
              <h2>Norwest Produce</h2>
              <p>Módulo separado con sus propios catálogos y movimientos.</p>
            </div>
            <span className="company-arrow">→</span>
          </Link>
        </div>
        <p className="gateway-note"><span /> Los registros nunca se mezclan entre empresas</p>
      </section>
    </main>
  );
}
