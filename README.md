# Rookbox

**English summary:** Rookbox gives AI agents on-demand Linux microVM machines, compatible with the
E2B SDK. This repository holds the product: API, dashboard, landing page, usage reporter and CLI,
all under [`product/`](product/). Docs below are in Brazilian Portuguese; the commands are the same
in any language. A beta waitlist is open.

## O que é

Rookbox entrega máquinas Linux (microVMs) sob demanda para agentes de IA. Cada máquina nasce em
segundos, pode ser suspensa e restaurada, e é compatível com o SDK da E2B: quem já usa o SDK só
precisa apontar para a API da Rookbox.

## Peças

Tudo vive em `product/`, um workspace pnpm + Turborepo.

| Caminho | O que é |
| --- | --- |
| `product/apps/api` | API do produto (Hono, oRPC, Prisma + Postgres, better-auth). Cria e gerencia as máquinas. |
| `product/apps/web` | Painel (Vite, React). Máquinas, chaves de API e uso. |
| `product/apps/www` | Landing page (Astro), em pt-BR, inglês e espanhol. |
| `product/apps/reporter` | Medição de uso: roda ao lado do servidor de máquinas e envia eventos de uso para a API. |
| `product/apps/cli` | Linha de comando `rookbox` (`rookbox new`, `rookbox shell`, ...). |
| `product/packages/contracts` | Contrato oRPC compartilhado e regras do ciclo de vida das máquinas. |
| `product/packages/ui-tokens`, `ui-web` | Tokens de design e componentes de interface. |

## Arquitetura

```
 SDK E2B / CLI / painel web
            |
            v
      apps/api  ---------- Postgres
            |
            v   (API compatível com E2B)
   servidor de microVMs  <---- apps/reporter (uso) ---> apps/api
```

## Rodar localmente

Requer Node 22.12+ e pnpm 9.

```sh
cd product
pnpm install
pnpm dev                          # landing e painel juntos
pnpm --filter @rookbox/www dev    # http://127.0.0.1:4321
pnpm --filter @rookbox/web dev    # http://127.0.0.1:5173
```

**Modo demo:** sem `VITE_API_URL`, o painel roda sobre uma API falsa em memória, sem login e sem
backend. Para usar a API real, veja `product/README.md` e `product/apps/api/.env.example`.

## Testes e verificações

```sh
cd product
pnpm lint check test build
```

O workflow `Product CI` roda os mesmos comandos em cada pull request.

## Deploy

O deploy usa apenas `product/` (diretório raiz `/product`, Dockerfile em `apps/<app>/Dockerfile`).
O passo a passo está em [`product/DEPLOY.md`](product/DEPLOY.md).

## Beta

A Rookbox está em beta fechado. O cadastro é por lista de espera: entre pela landing page e os
convites saem por e-mail.

## Contribuir e segurança

Veja [CONTRIBUTING.md](CONTRIBUTING.md) e [SECURITY.md](SECURITY.md).

## Licença

O código próprio da Rookbox é proprietário, todos os direitos reservados
(TODO(owner): confirmar a licença). O arquivo `LICENSE` (Apache-2.0) na raiz é mantido porque o
histórico do Git ainda contém código de terceiros sob essa licença.
