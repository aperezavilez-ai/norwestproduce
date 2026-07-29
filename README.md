# NORWEST ERP USA

ERP operativo para Norwest Produce LLC. La aplicacion centraliza catalogos,
ventas, inventario importado, facturacion, cartera, reportes, administracion y
cotizaciones para importar.

Produccion: https://norwestproduce.vercel.app

## Modulos principales

- Inicio de sesion y seleccion de empresa.
- Catalogos USA: clientes, proveedores, productos, bodegas y usuarios.
- Compra y reventa.
- Inventario importado con entradas, ventas, costos, gastos y adjuntos.
- Facturacion, ajustes posteriores y cartera.
- Cotizacion para importar sin impacto contable u operativo.
- Centro de reportes USA.
- Administracion de liquidaciones por vendedor.

## Desarrollo local

Requisitos:

- Node.js `>=22.13.0`
- pnpm

Comandos utiles:

```bash
pnpm install
pnpm exec tsc --noEmit
pnpm exec next build
pnpm run build:vercel
```

El despliegue principal usa Vercel. El proyecto conserva archivos de
compatibilidad con Vinext/Cloudflare Sites porque algunas rutas de desarrollo y
hosting alterno dependen de esa estructura.

## Variables y servicios

No se deben versionar archivos `.env*`. Configurar secretos desde Vercel o el
entorno correspondiente.

Servicios esperados:

- Base de datos configurada por las variables usadas en `db/`.
- Vercel Blob para adjuntos y documentos, con `BLOB_READ_WRITE_TOKEN` o
  configuracion equivalente del proyecto.
- Migraciones en `drizzle/`.

## Verificacion antes de publicar

Antes de subir cambios:

```bash
pnpm exec tsc --noEmit
pnpm exec next build
git diff --check
```

Despues de validar, subir a GitHub y desplegar en Vercel produccion.
