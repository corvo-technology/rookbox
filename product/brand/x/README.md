# Rookbox on X

Brand kit for the X account `@rookboxx`: avatar, banner, launch post images, a four-slide
carousel, and the copy that goes with them. Everything in `png/` is generated.

## Regenerate

```sh
node product/brand/x/build.mjs            # all images
node product/brand/x/build.mjs banner     # only files whose name contains "banner"
```

Needs Node and Chrome (set `CHROME_PATH` if it is not in a usual location). If `ffmpeg` is on the
PATH the PNGs are palette-quantized (flat colors, so no visible loss); every file is well under
600 KB. No dependencies to install. It reuses the Instrument Sans font from `apps/www/public/fonts`
and the castle mark from `apps/web/src/components/Logo.tsx`. Tokens are in `base.css`, layouts and
copy in `build.mjs`. The terminal font is the system monospace (Menlo on macOS), so a render on
another OS looks slightly different.

## Files

| File | Size | Use |
| --- | --- | --- |
| `png/avatar.png` | 400x400 | Profile picture (black mark on white). |
| `png/avatar-dark.png` | 400x400 | Alternate (white mark on #0a0a0a). |
| `png/banner-pt.png`, `png/banner-en.png` | 1500x500 | Profile header. Left 440 px empty for the avatar; 70 px clear top and bottom for mobile crops. |
| `png/launch-pt.png`, `png/launch-en.png` | 1200x675 | Waitlist announcement. |
| `png/launch-pt-pix.png` | 1200x675 | Brazilian angle: Pix is marked as planned. Portuguese only. |
| `png/carousel-1.png` to `carousel-4.png` | 1080x1350 | Thread or carousel, Portuguese only. |

The avatar mark is 200 by 250 px inside a 400 px canvas, so it stays inside the circle X crops to
and is still readable at 48 px.

## Claims the images make

Only what the site already says: Firecracker microVM with its own kernel, about 2 s to start,
about 1 s to resume, E2B SDK compatible, invitation-only waitlist, billing per second with prices
not published. The code is real E2B SDK usage (`Sandbox.create`, `commands.run`, `pause`,
`Sandbox.connect`) against `box.rookbox.run`. Pix billing is **not live**; the Pix image says
"Previsto. Ainda não está no ar." Update or drop that image before billing changes.

## Bio (max 160 characters)

Portuguese (127):

```
Um computador para cada agente. Máquinas Linux sob demanda, compatíveis com o SDK da E2B. Lista de espera aberta em rookbox.run
```

English (118):

```
Give every agent its own computer. On-demand Linux machines, compatible with the E2B SDK. Waitlist open at rookbox.run
```

Link field: `https://rookbox.run`

## Pinned post

Portuguese (attach `launch-pt.png`):

```
A lista de espera do Rookbox está aberta.

Máquinas Linux sob demanda para agentes. Cada uma é uma microVM Firecracker com kernel próprio, inicia em cerca de 2 s e funciona com o SDK da E2B: você muda uma linha.

O acesso é só por convite, em lotes pequenos.

rookbox.run
```

English (attach `launch-en.png`):

```
The Rookbox waitlist is open.

On-demand Linux machines for agents. Each one is a Firecracker microVM with its own kernel, starts in about 2 s and works with the E2B SDK: you change one line.

Access is by invitation, in small batches.

rookbox.run
```

Thread for the carousel (pt, one slide per post): 1 "Um computador para cada agente." 2 "Crie,
rode, suspenda, retome." 3 "Mude uma linha." 4 "Entre na lista de espera: rookbox.run".

Pix post (pt, attach `launch-pt-pix.png`):

```
Previsto para a cobrança: pagar em reais, com Pix. Ainda não está no ar, e os preços ainda não foram publicados. A cobrança será por segundo.

rookbox.run
```

## Alt text

Keep these when posting; X allows 1000 characters.

- `avatar.png`: Castle tower mark of Rookbox in black on a white background.
- `avatar-dark.png`: Castle tower mark of Rookbox in white on a near-black background.
- `banner-pt.png`: Fundo preto com o título "Dê a cada agente o próprio computador.", o perfil @rookboxx e rookbox.run, ao lado de um terminal com código Python do SDK da E2B criando uma máquina com domain="box.rookbox.run".
- `banner-en.png`: Black background with the headline "Give every agent its own computer.", the handle @rookboxx and rookbox.run, next to a terminal showing Python E2B SDK code creating a machine with domain="box.rookbox.run".
- `launch-pt.png`: Logo do Rookbox e o título "Lista de espera aberta.", com o texto "Máquinas Linux sob demanda para agentes. Acesso por convite, em lotes pequenos.", rookbox.run e @rookboxx. À direita, um terminal com código Python do SDK da E2B criando uma máquina, com a linha domain="box.rookbox.run" destacada.
- `launch-en.png`: Rookbox logo and the headline "Waitlist is open.", with the text "On-demand Linux machines for agents. Invitation only, in small batches.", rookbox.run and @rookboxx. On the right, a terminal with Python E2B SDK code creating a machine, the line domain="box.rookbox.run" highlighted.
- `launch-pt-pix.png`: Fundo preto com o título "Pague em reais, com Pix." e a etiqueta tracejada "Previsto. Ainda não está no ar.". Texto: "Previsto para a cobrança, que será por segundo. Os preços ainda não foram publicados." Abaixo, uma fileira de traços representando segundos, de "a máquina inicia" a "a máquina suspende".
- `carousel-1.png`: Slide 1 de 4. Título "Um computador para cada agente." Texto: máquinas Linux sob demanda, cada uma uma microVM Firecracker, não um contêiner compartilhado. Lista: kernel próprio, inicia em cerca de 2 s, retoma em cerca de 1 s.
- `carousel-2.png`: Slide 2 de 4. Título "Crie, rode, suspenda, retome." Um terminal com código Python: Sandbox.create com template "seed", commands.run("uname -sr") que devolve Linux, sbx.pause() e Sandbox.connect(sbx.sandbox_id), com comentários sobre iniciar em cerca de 2 s e retomar em cerca de 1 s.
- `carousel-3.png`: Slide 3 de 4. Título "Mude uma linha." Dois terminais, "Antes" e "Com o Rookbox". O segundo tem a mesma chamada Sandbox.create com uma linha a mais, destacada: domain="box.rookbox.run".
- `carousel-4.png`: Slide 4 de 4, fundo preto. Título "Entre na lista de espera." Texto: o acesso é só por convite, em lotes pequenos. Endereço rookbox.run em verde e a frase "Deixe seu email no site."
