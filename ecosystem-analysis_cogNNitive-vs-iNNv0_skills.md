# Análisis de Integración: cogNNitive ↔ actioNN

## Resumen Ejecutivo

**cogNNitive** es el hub de especificaciones, tooling y motor del ecosistema iNNfo.
**actioNN** es la colección de skills modulares para OpenCode que consumen e interactúan con cogNNitive.

Son **dos caras de la misma moneda**: cogNNitive *define y ejecuta*, actioNN *instruye al agente* para usar lo que cogNNitive expone.

---

## 1. División de Responsabilidades

| Dimensión | cogNNitive | actioNN |
|-----------|-----------|--------------|
| **Rol primario** | Motor + especificaciones + editor | Skills de agente (OpenCode) |
| **Qué contiene** | Código, specs, MCP server, tests, editor Vue | Instrucciones declarativas (SKILL.md), scripts auxiliares, docs de skills |
| **Quién lo ejecuta** | Node.js, navegador, CI | El LLM del agente (guiado por SKILL.md) |
| **Versiona** | Especificaciones iNNfo (v0.2.0) + paquetes npm | Skills individualmente (V_x-y-z) |
| **Testing** | Vitest + Playwright — full suite | Explícitamente *sin* test runner (es un repo de instrucciones) |
| **Output** | Editor web, MCP bundle, docs site | Skills instalables en `~/.agents/skills/` |

Es una separación limpia: **cogNNitive es el backend del conocimiento**, actioNN es **la capa de interacción agente-humano**.

---

## 2. Puntos de Integración (Cómo se Conectan)

### 2.1 innfo-mcp — El puente principal

```
actioNN/.opencode/opencode.json
  → registra "innfo-mcp" como MCP server local
  → apunta a scripts/bin/innfo-mcp.bundle.js
  → ese bundle se descarga DESDE cogNNitive:
     https://raw.githubusercontent.com/innV0/cogNNitive/main/packages/innfo-mcp/
  → el bundle envuelve @innv0/innfo-core (parser, validator, resolver, mutator)
```

**Flujo**: SKILL.md del skill `nn-innfo` → instruye al agente a usar tools del MCP → `innfo-mcp` (stdio) → `@innv0/innfo-core` → specs desde GitHub.

### 2.2 URLs de especificaciones canónicas

Todas las skills que trabajan con modelos iNNfo (especialmente `nn-innfo`) referencian URLs que apuntan a `cogNNitive/main/specs/latest/`:

```
https://raw.githubusercontent.com/innV0/cogNNitive/main/specs/latest/level0/defiNNe_NN.md
https://raw.githubusercontent.com/innV0/cogNNitive/main/specs/latest/level1/iNNfo_NN.md
https://raw.githubusercontent.com/innV0/cogNNitive/main/specs/latest/level2/business/business_NN.md
https://raw.githubusercontent.com/innV0/cogNNitive/main/specs/latest/level2/procedures/procedures_NN.md
https://raw.githubusercontent.com/innV0/cogNNitive/main/specs/latest/level2/organization/organization_NN.md
```

Si cogNNitive cambia una spec, actioNN lo recibe automáticamente (porque resuelve en runtime vía MCP).

### 2.3 Version sync via `scripts/update-mcp.js`

```
actioNN/scripts/update-mcp.js
  → fetchea versión remota desde cogNNitive/packages/innfo-mcp/package.json
  → compara con .innv0/mcp-version.json
  → si hay nueva versión, descarga el bundle y actualiza el version file
```

### 2.4 Pipeline gates compartidas

`cogNNitive/packages/pipeline-gates/` define validación e integración de modelos.
`actioNN/scripts/build-registry.js` usa los mismos principios (sin depender del paquete npm — es zero-dependency por diseño).

### 2.5 Agent rules

cogNNitive tiene `.opencode/rules/innfo.md` que define workflow rules para el agente dentro de cogNNitive.
actioNN tiene los mismos patrones pero generalizados para cualquier proyecto que instale las skills.

---

## 3. Sinergias Existentes

### 3.1 Separación engine ↔ instructions

Es el acierto más grande. Separar el motor (cogNNitive: TypeScript, testing, CI) de las instrucciones al agente (actioNN: markdown declarativo) significa que:

- **Puedes actualizar el motor sin tocar skills** — si `innfo-core` cambia internamente, el MCP bundle se regenera y las skills lo consumen sin cambios.
- **Puedes actualizar skills sin tocar el motor** — si descubres un mejor prompting pattern, solo editas SKILL.md.
- **Un tercero puede escribir skills** que consuman el MCP de cogNNitive sin entender el código interno.

### 3.2 Single source of truth para specs

Tener las specs (level 0-2) **solo en cogNNitive** y referenciarlas por URL desde actioNN evita drift. No hay copias locales que pueda quedar obsoletas.

### 3.3 MCP como interfaz estable

El MCP server (innfo-mcp) expone 7 tools semánticas que son la API entre la skill y el engine. Mientras esa interfaz no cambie, ambos lados evolucionan independientemente. Esto es arquitectura de hexagonales aplicada a agentes.

### 3.4 Ciclo SDD compartido

Ambos repos usan `openspec/` con el mismo methodology. Significa que el equipo piensa en términos de especificación → diseño → tareas → código de forma consistente a través de los dos repos.

### 3.5 Script de sync automático

`scripts/update-mcp.js` en actioNN mantiene el bundle del MCP server actualizado contra cogNNitive. Es un mecanismo de sync simple pero efectivo.

---

## 4. Diagnóstico: ¿Está bien pensado como ecosistema?

**Sí, en términos generales.** La separación es conceptualmente correcta y sigue buenas prácticas:

- ✅ **Separación de concerns** clara: engine ≠ agent instructions
- ✅ **Interfaz estable** (MCP protocol) entre los dos
- ✅ **Single source of truth** para specs
- ✅ **Versionado semántico** en ambos lados
- ✅ **Mecanismo de sync** explícito
- ✅ Ambas se pueden desarrollar y testear independientemente

### Pero hay áreas cuestionables:

#### ⚠️ El bundler del MCP en skills está git-tracked

`actioNN/scripts/bin/innfo-mcp.bundle.js` es un *binario generado* (JS bundle) que se trackea en git. Esto duplica el código que ya está en cogNNitive y puede quedar obsoleto si alguien no corre `update-mcp.js`. Alternativas:
- **.gitignore** el bundle y que `update-mcp.js` corra automáticamente (postinstall, hook, etc.)
- O bien que el MCP server se instale desde npm (`@innv0/innfo-mcp` publicado)

#### ⚠️ El `skills-lock.json` de actioNN referencia 28 skills de mattpocock que no están presentes

El lock file promete skills que no existen en disco. Esto es confuso. O se elimina el lock file, o se implementa el sync, o se documenta explícitamente que es un *future reference*.

#### ⚠️ Tests solo en cogNNitive, ninguno en actioNN

Aunque es intencional (es un repo de instrucciones), el `nn-trannsform` skill incluye un CLI tool (`scripts/index.js`) con dependencias npm que **no tiene tests**. Si ese tool se rompe, no hay red de seguridad.

#### ⚠️ cogNNitive tiene su propio `.opencode/rules/innfo.md` duplicando lógica de skills

Parte de la lógica de `nn-innfo` skill está duplicada en cogNNitive (`.opencode/rules/` y `.opencode/agents/`). Cuando cambia el comportamiento, hay que actualizar ambos repos. El ideal sería que cogNNitive delegue completamente en actioNN para la interacción con el agente.

---

## 5. Propuestas de Mejora

### 5.1 Inmediatas (bajo esfuerzo, alto impacto)

| # | Propuesta | Beneficio |
|---|-----------|-----------|
| 1 | `.gitignore` el bundle MCP en actioNN, que `update-mcp.js` corra en postinstall o al iniciar sesión | Elimina duplicación, siempre actualizado |
| 2 | Eliminar skills-lock.json de actioNN o implementar el sync real | Claridad, elimina confusión |
| 3 | Publicar `@innv0/innfo-mcp` en npm real | Elimina el bundle manual, instalación con `npm install`, versionado real |

### 5.2 Mediano plazo

| # | Propuesta | Beneficio |
|---|-----------|-----------|
| 4 | Mover `.opencode/rules/innfo.md` de cogNNitive a actioNN, que cogNNitive lo consuma como skill externa | Elimina duplicación de lógica agente |
| 5 | Agregar tests para `scripts/index.js` de trannsform en actioNN (Vitest mínimo) | Red de seguridad para el CLI tool |
| 6 | Estandarizar el versionado: que el skill `nn-innfo` use la version del MCP server como dependencia declarada | Trazabilidad de compatibilidad |

### 5.3 Arquitectónicas (requiere discusión)

| # | Propuesta | Tradeoff |
|---|-----------|----------|
| 7 | **Unificar en un solo repo**: cogNNitive como monorepo que incluya `skills/` como workspace | - Elimina sync overhead<br>- Un solo SDD cycle<br>- Contra: mezcla engine+instructions, el repo se hace grande, permisos menos granulares |
| 8 | **Mantener separados pero agregar un contrato formal** (API versionada del MCP como spec document) | + Claridad de integración<br>+ Documentación viva<br>- Requiere mantenimiento |
| 9 | **Pipeline CI/CD automatizado**: que un cambio en cogNNitive (spec o MCP) dispare automáticamente `update-mcp.js` en actioNN vía GitHub Actions cross-repo | Sync automático, cero fricción |

---

## 6. Diagrama de Integración Actual

```
┌─────────────────────────────────────────────────┐
│                 cogNNitive                        │
│                                                   │
│  specs/ (levels 0-2)                              │
│  packages/innfo-core/ (TS engine)                 │
│  packages/innfo-mcp/ (MCP server wrapper)         │
│  apps/innfo-editor/ (Vue 3 SPA)                   │
│  packages/pipeline-gates/ (CI validation)          │
│                                                   │
│  El MCP server se builda como bundle.js            │
│  y se deploya a docs/cdn/                         │
└──────────────────────┬──────────────────────────┘
                       │
           ┌───────────┴───────────┐
           │   GitHub RAW URLs      │
           │   (specs, bundles)     │
           └───────────┬───────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│                 actioNN                     │
│                                                   │
│  skills/nn-innfo/ → usa MCP tools              │
│  scripts/bin/innfo-mcp.bundle.js (git-tracked)    │
│  scripts/update-mcp.js (sync desde cogNNitive)    │
│  .opencode/opencode.json (registra MCP server)    │
│                                                   │
│  Otras skills (trannsform, site-generator, etc.)  │
│  no dependen de cogNNitive directamente           │
└─────────────────────────────────────────────────┘
```

---

## 7. Conclusión

El ecosistema está **bien pensado en su arquitectura conceptual**: la separación entre motor (cogNNitive) e instrucciones al agente (actioNN) es la correcta. La interfaz MCP como puente estable es el acierto clave.

Los problemas principales son **de ejecución y sincronización**, no de diseño:

1. El bundle MCP git-tracked en skills duplica código y puede quedar obsoleto
2. skills-lock.json promete skills que no existen
3. Hay duplicación de lógica agente entre los dos repos
4. Faltan tests en el CLI tool de trannsform

**Recomendación**: no unificar los repos — la separación es valiosa. Pero sí:
- Eliminar el bundle del git tracking
- Publicar `@innv0/innfo-mcp` a npm
- Centralizar la lógica agente en actioNN
- Automatizar el sync cross-repo vía CI/CD

El ecosistema es sólido y bien arquitectado. Con esos ajustes, escala sin fricción.
