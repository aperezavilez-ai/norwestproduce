"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [loginOpen, setLoginOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setLoginError("");
    setLoginLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.get("email"), password: formData.get("password") }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "No fue posible iniciar sesion.");
      router.push("/empresas");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "No fue posible iniciar sesion.");
    } finally {
      setLoginLoading(false);
    }
  }

  return (
    <main className="login-gateway">
      <img
        className="login-gateway-image"
        src="/norwest-login-hero.png"
        alt="Norwest Produce"
      />
      <button
        className="login-access-button"
        type="button"
        onClick={() => {
          setLoginError("");
          setLoginOpen(true);
        }}
      >
        Ingresar
      </button>

      {loginOpen && (
        <div className="login-modal-backdrop" role="presentation">
          <form className="login-modal" onSubmit={submitLogin}>
            <div className="login-modal-heading">
              <p className="eyebrow">Norwest Produce</p>
              <h1>Iniciar sesion</h1>
            </div>
            <label>
              Correo
              <input
                autoComplete="email"
                name="email"
                placeholder="correo@empresa.com"
                required
                type="email"
              />
            </label>
            <label>
              Contrasena
              <span className="password-field">
                <input
                  autoComplete="current-password"
                  name="password"
                  placeholder="Ingresa tu contrasena"
                  required
                  type={showPassword ? "text" : "password"}
                />
                <button
                  aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                  className={`password-eye-button ${showPassword ? "visible" : ""}`}
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                >
                  <span />
                </button>
              </span>
            </label>
            <div className="login-modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setLoginError("");
                  setLoginOpen(false);
                }}
              >
                Cancelar
              </button>
              <button className="primary-button" type="submit" disabled={loginLoading}>
                {loginLoading ? "Validando..." : "Iniciar sesion"}
              </button>
            </div>
            {loginError && <p className="login-error">{loginError}</p>}
          </form>
        </div>
      )}
    </main>
  );
}
