# AnÃ¡lisis de IntegraciÃ³n: cogNNitive â†” actioNN

## Resumen Ejecutivo

**cogNNitive** es el hub de especificaciones, tooling y motor del ecosistema iNNfo.
**actioNN** es la colecciÃ³n de skills modulares para OpenCode que consumen e interactÃºan con cogNNitive.

Son **dos caras de la misma moneda**: cogNNitive *define y ejecuta*, actioNN *instruye al agente* para usar lo que cogNNitive expone.

---

## 1. DivisiÃ³n de Responsabilidades

| DimensiÃ³n | cogNNitive | actioNN |
|-----------|-----------|--------------|
| **Rol primario** | Motor + especificaciones + editor | Skills de agente (OpenCode) |
| **QuÃ© contiene** | CÃ³digo, specs, MCP server, tests, editor Vue | Instrucciones declarativas (SKILL.md), scripts auxiliares, docs de skills |
| **QuiÃ©n lo ejecuta** | Node.js, navegador, CI | El LLM del agente (guiado por SKILL.md) |
| **Versiona** | Especificaciones iNNfo (v0.2.0) + paquetes npm | Skills individualmente (V_x-y-z) |
| **Testing** | Vitest + Playwright â€” full suite | ExplÃ­citamente *sin* test runner (es un repo de instrucciones) |
| **Output** | Editor web, MCP bundle, docs site | Skills instalables en `~/.agents/skills/` |

Es una separaciÃ³n limpia: **cogNNitive es el backend del conocimiento**, actioNN es **la capa de interacciÃ³n agente-humano**.

---

## 2. Puntos de IntegraciÃ³n (CÃ³mo se Conectan)

### 2.1 innfo-mcp â€” El puente principal

```
actioNN/.opencode/opencode.json
  â†’ registra "innfo-mcp" como MCP server local
  â†’ apunta a scripts/bin/innfo-mcp.bundle.js
  â†’ ese bundle se descarga DESDE cogNNitive:
     https://raw.githubusercontent.com/innV0/cogNNitive/main/packages/innfo-mcp/
  â†’ el bundle envuelve @cognnitive/innfo-core (parser, validator, resolver, mutator)
```

**Flujo**: SKILL.md del skill `NN-innfo` â†’ instruye al agente a usar tools del MCP â†’ `innfo-mcp` (stdio) â†’ `@cognnitive/innfo-core` â†’ specs desde GitHub.

### 2.2 URLs de especificaciones canÃ³nicas

Todas las skills que trabajan con modelos iNNfo (especialmente `NN-innfo`) referencian URLs que apuntan a `cogNNitive/main/specs/latest/`:

```
https://raw.githubusercontent.com/innV0/cogNNitive/main/specs/latest/level0/defiNNe_NN.md
https://raw.githubusercontent.com/innV0/cogNNitive/main/specs/latest/level1/iNNfo_NN.md
https://raw.githubusercontent.com/innV0/cogNNitive/main/specs/latest/level2/business/business_NN.md
https://raw.githubusercontent.com/innV0/cogNNitive/main/specs/latest/level2/procedures/procedures_NN.md
https://raw.githubusercontent.com/innV0/cogNNitive/main/specs/latest/level2/organization/organization_NN.md
```

Si cogNNitive cambia una spec, actioNN lo recibe automÃ¡ticamente (porque resuelve en runtime vÃ­a MCP).

### 2.3 Version sync via `scripts/update-mcp.js`

```
actioNN/scripts/update-mcp.js
  â†’ fetchea versiÃ³n remota desde cogNNitive/packages/innfo-mcp/package.json
  â†’ compara con .cogNNitive/mcp-version.json
  â†’ si hay nueva versiÃ³n, descarga el bundle y actualiza el version file
```

### 2.4 Pipeline gates compartidas

`cogNNitive/packages/pipeline-gates/` define validaciÃ³n e integraciÃ³n de modelos.
`actioNN/scripts/build-registry.js` usa los mismos principios (sin depender del paquete npm â€” es zero-dependency por diseÃ±o).

### 2.5 Agent rules

cogNNitive tiene `.opencode/rules/innfo.md` que define workflow rules para el agente dentro de cogNNitive.
actioNN tiene los mismos patrones pero generalizados para cualquier proyecto que instale las skills.

---

## 3. Sinergias Existentes

### 3.1 SeparaciÃ³n engine â†” instructions

Es el acierto mÃ¡s grande. Separar el motor (cogNNitive: TypeScript, testing, CI) de las instrucciones al agente (actioNN: markdown declarativo) significa que:

- **Puedes actualizar el motor sin tocar skills** â€” si `innfo-core` cambia internamente, el MCP bundle se regenera y las skills lo consumen sin cambios.
- **Puedes actualizar skills sin tocar el motor** â€” si descubres un mejor prompting pattern, solo editas SKILL.md.
- **Un tercero puede escribir skills** que consuman el MCP de cogNNitive sin entender el cÃ³digo interno.

### 3.2 Single source of truth para specs

Tener las specs (level 0-2) **solo en cogNNitive** y referenciarlas por URL desde actioNN evita drift. No hay copias locales que pueda quedar obsoletas.

### 3.3 MCP como interfaz estable

El MCP server (innfo-mcp) expone 7 tools semÃ¡nticas que son la API entre la skill y el engine. Mientras esa interfaz no cambie, ambos lados evolucionan independientemente. Esto es arquitectura de hexagonales aplicada a agentes.

### 3.4 Ciclo SDD compartido

Ambos repos usan `openspec/` con el mismo methodology. Significa que el equipo piensa en tÃ©rminos de especificaciÃ³n â†’ diseÃ±o â†’ tareas â†’ cÃ³digo de forma consistente a travÃ©s de los dos repos.

### 3.5 Script de sync automÃ¡tico

`scripts/update-mcp.js` en actioNN mantiene el bundle del MCP server actualizado contra cogNNitive. Es un mecanismo de sync simple pero efectivo.

---

## 4. DiagnÃ³stico: Â¿EstÃ¡ bien pensado como ecosistema?

**SÃ­, en tÃ©rminos generales.** La separaciÃ³n es conceptualmente correcta y sigue buenas prÃ¡cticas:

- âœ… **SeparaciÃ³n de concerns** clara: engine â‰  agent instructions
- âœ… **Interfaz estable** (MCP protocol) entre los dos
- âœ… **Single source of truth** para specs
- âœ… **Versionado semÃ¡ntico** en ambos lados
- âœ… **Mecanismo de sync** explÃ­cito
- âœ… Ambas se pueden desarrollar y testear independientemente

### Pero hay Ã¡reas cuestionables:

#### âš ï¸ El bundler del MCP en skills estÃ¡ git-tracked

`actioNN/scripts/bin/innfo-mcp.bundle.js` es un *binario generado* (JS bundle) que se trackea en git. Esto duplica el cÃ³digo que ya estÃ¡ en cogNNitive y puede quedar obsoleto si alguien no corre `update-mcp.js`. Alternativas:
- **.gitignore** el bundle y que `update-mcp.js` corra automÃ¡ticamente (postinstall, hook, etc.)
- O bien que el MCP server se instale desde npm (`@cognnitive/innfo-mcp` publicado)

#### âš ï¸ El `skills-lock.json` de actioNN referencia 28 skills de mattpocock que no estÃ¡n presentes

El lock file promete skills que no existen en disco. Esto es confuso. O se elimina el lock file, o se implementa el sync, o se documenta explÃ­citamente que es un *future reference*.

#### âš ï¸ Tests solo en cogNNitive, ninguno en actioNN

Aunque es intencional (es un repo de instrucciones), el `nn-trannsform` skill incluye un CLI tool (`scripts/index.js`) con dependencias npm que **no tiene tests**. Si ese tool se rompe, no hay red de seguridad.

#### âš ï¸ cogNNitive tiene su propio `.opencode/rules/innfo.md` duplicando lÃ³gica de skills

Parte de la lÃ³gica de `NN-innfo` skill estÃ¡ duplicada en cogNNitive (`.opencode/rules/` y `.opencode/agents/`). Cuando cambia el comportamiento, hay que actualizar ambos repos. El ideal serÃ­a que cogNNitive delegue completamente en actioNN para la interacciÃ³n con el agente.

---

## 5. Propuestas de Mejora

### 5.1 Inmediatas (bajo esfuerzo, alto impacto)

| # | Propuesta | Beneficio |
|---|-----------|-----------|
| 1 | `.gitignore` el bundle MCP en actioNN, que `update-mcp.js` corra en postinstall o al iniciar sesiÃ³n | Elimina duplicaciÃ³n, siempre actualizado |
| 2 | Eliminar skills-lock.json de actioNN o implementar el sync real | Claridad, elimina confusiÃ³n |
| 3 | Publicar `@cognnitive/innfo-mcp` en npm real | Elimina el bundle manual, instalaciÃ³n con `npm install`, versionado real |

### 5.2 Mediano plazo

| # | Propuesta | Beneficio |
|---|-----------|-----------|
| 4 | Mover `.opencode/rules/innfo.md` de cogNNitive a actioNN, que cogNNitive lo consuma como skill externa | Elimina duplicaciÃ³n de lÃ³gica agente |
| 5 | Agregar tests para `scripts/index.js` de trannsform en actioNN (Vitest mÃ­nimo) | Red de seguridad para el CLI tool |
| 6 | Estandarizar el versionado: que el skill `NN-innfo` use la version del MCP server como dependencia declarada | Trazabilidad de compatibilidad |

### 5.3 ArquitectÃ³nicas (requiere discusiÃ³n)

| # | Propuesta | Tradeoff |
|---|-----------|----------|
| 7 | **Unificar en un solo repo**: cogNNitive como monorepo que incluya `skills/` como workspace | - Elimina sync overhead<br>- Un solo SDD cycle<br>- Contra: mezcla engine+instructions, el repo se hace grande, permisos menos granulares |
| 8 | **Mantener separados pero agregar un contrato formal** (API versionada del MCP como spec document) | + Claridad de integraciÃ³n<br>+ DocumentaciÃ³n viva<br>- Requiere mantenimiento |
| 9 | **Pipeline CI/CD automatizado**: que un cambio en cogNNitive (spec o MCP) dispare automÃ¡ticamente `update-mcp.js` en actioNN vÃ­a GitHub Actions cross-repo | Sync automÃ¡tico, cero fricciÃ³n |

---

## 6. Diagrama de IntegraciÃ³n Actual

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                 cogNNitive                        â”‚
â”‚                                                   â”‚
â”‚  specs/ (levels 0-2)                              â”‚
â”‚  packages/innfo-core/ (TS engine)                 â”‚
â”‚  packages/innfo-mcp/ (MCP server wrapper)         â”‚
â”‚  apps/innfo-editor/ (Vue 3 SPA)                   â”‚
â”‚  packages/pipeline-gates/ (CI validation)          â”‚
â”‚                                                   â”‚
â”‚  El MCP server se builda como bundle.js            â”‚
â”‚  y se deploya a docs/cdn/                         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                       â”‚
           â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
           â”‚   GitHub RAW URLs      â”‚
           â”‚   (specs, bundles)     â”‚
           â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                       â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                 actioNN                     â”‚
â”‚                                                   â”‚
â”‚  skills/NN-innfo/ â†’ usa MCP tools              â”‚
â”‚  scripts/bin/innfo-mcp.bundle.js (git-tracked)    â”‚
â”‚  scripts/update-mcp.js (sync desde cogNNitive)    â”‚
â”‚  .opencode/opencode.json (registra MCP server)    â”‚
â”‚                                                   â”‚
â”‚  Otras skills (trannsform, site-generator, etc.)  â”‚
â”‚  no dependen de cogNNitive directamente           â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## 7. ConclusiÃ³n

El ecosistema estÃ¡ **bien pensado en su arquitectura conceptual**: la separaciÃ³n entre motor (cogNNitive) e instrucciones al agente (actioNN) es la correcta. La interfaz MCP como puente estable es el acierto clave.

Los problemas principales son **de ejecuciÃ³n y sincronizaciÃ³n**, no de diseÃ±o:

1. El bundle MCP git-tracked en skills duplica cÃ³digo y puede quedar obsoleto
2. skills-lock.json promete skills que no existen
3. Hay duplicaciÃ³n de lÃ³gica agente entre los dos repos
4. Faltan tests en el CLI tool de trannsform

**RecomendaciÃ³n**: no unificar los repos â€” la separaciÃ³n es valiosa. Pero sÃ­:
- Eliminar el bundle del git tracking
- Publicar `@cognnitive/innfo-mcp` a npm
- Centralizar la lÃ³gica agente en actioNN
- Automatizar el sync cross-repo vÃ­a CI/CD

El ecosistema es sÃ³lido y bien arquitectado. Con esos ajustes, escala sin fricciÃ³n.
