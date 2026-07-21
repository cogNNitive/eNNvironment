---
agent-bootstrap:
  version: "1.0"
  skills:
    - name: NN-innfo
      repo: https://github.com/cogNNitive/actioNN
      path: skills/NN-innfo
      description: Crear, editar y validar modelos iNNfo
      mcp:
        - name: innfo-mcp
          url: https://raw.githubusercontent.com/cogNNitive/cogNNitive/main/packages/innfo-mcp/bin/innfo-mcp.bundle.js
    - name: NN-trannsform
      repo: https://github.com/cogNNitive/actioNN
      path: skills/NN-trannsform
      description: Pipeline de transformaciÃ³n de documentos
    - name: NN-workflow-orchestrator
      repo: https://github.com/cogNNitive/actioNN
      path: skills/NN-workflow-orchestrator
      description: Ejecutar flujos multi-skill con stages secuenciales
  workflows:
    - id: cognnitive
      label: "CogNNitive â€” Crear un modelo iNNfo desde cero"
      description: Elegir template, nombrar modelo, configurar workspace
      skill: NN-innfo
    - id: transform
      label: "traNNsform â€” Pipeline de transformaciÃ³n de documentos"
      description: Importar/exportar documentos, procesar archivos
      skill: NN-trannsform
---

# eNNvironment

Synopsis, manifest, y punto de entrada del ecosistema iNNv0. Este repo documenta cÃ³mo se relacionan los proyectos del ecosistema y sirve como bootstrap para que un AI Agent instale los skills necesarios.

â†’ Para empezar, decile a tu agente: _"Quiero usar eNNvironment https://cognnitive.com"_

---

## Â¿QuÃ© es eNNvironment?

eNNvironment es la puerta de entrada al ecosistema iNNv0. Le dice al agente quÃ© skills instalar, de dÃ³nde descargarlos, y quÃ© flujos de trabajo estÃ¡n disponibles.

### Skills que instala

| Skill | DescripciÃ³n |
|-------|-------------|
| `NN-innfo` | Crear, editar y validar modelos iNNfo (delega al MCP de cogNNitive) |
| `NN-trannsform` | Pipeline de importaciÃ³n/exportaciÃ³n de documentos |
| `NN-workflow-orchestrator` | OrquestaciÃ³n multi-skill |

### Flujos disponibles

| OpciÃ³n | DescripciÃ³n |
|--------|-------------|
| **CogNNitive** | Crear un modelo iNNfo desde cero: elegir template, nombrar, configurar workspace |
| **traNNsform** | Pipeline de transformaciÃ³n de documentos: importar/exportar, procesar archivos |

---

## Â¿CÃ³mo funciona?

```
Usuario: "Quiero usar eNNvironment <URL>"
         â”‚
         â–¼
Agent Web Bootstrap Skill
  â”œâ”€ Fetch URL â†’ parsea YAML frontmatter
  â”œâ”€ Descarga skills desde GitHub
  â”œâ”€ Si el skill declara MCP: descarga bundle + registra en opencode.json
  â”œâ”€ Valida con skill-origin-guard
  â””â”€ Presenta menÃº de workflows
```

El bootstrap se encarga de todo: descarga, instalaciÃ³n, validaciÃ³n y registro de MCP. Solo se ejecuta una vez; la prÃ³xima vez los skills ya estÃ¡n disponibles.

---

## cogNNitive â€” Motor de iNNfo

**PropÃ³sito**: Hub de especificaciones, tooling y motor del ecosistema [iNNfo](https://github.com/cogNNitive/cogNNitive).

- Define las especificaciones iNNfo (niveles 0-2: defiNNe, iNNfo, templates)
- Implementa `@cognnitive/innfo-core` â€” parser, validador, resolvedor de cadenas de specs
- Provee `@cognnitive/innfo-mcp` â€” servidor MCP que expone tools determinÃ­sticas para AI agents
- Incluye **iNNfo Modeler** â€” editor Vue 3 SPA para modelos iNNfo
- Pipeline de validaciÃ³n CI (`pipeline-gates`)

## actioNN â€” Skills de Agente

**PropÃ³sito**: ColecciÃ³n modular de skills para OpenCode (y agentes compatibles) que enseÃ±an al AI agent a trabajar con el ecosistema iNNfo.

Skills disponibles en https://github.com/cogNNitive/actioNN

---

## CÃ³mo se Integran

```
AI Agent â†’ actioNN (instrucciones) â†’ innfo-mcp (MCP server) â†’ @cognnitive/innfo-core
                                                                       â†“
                                                           Specs en GitHub RAW
                                                           (cogNNitive/specs/latest/)
```

### Punto de integraciÃ³n principal: innfo-mcp

El MCP server es el puente. Vive en cogNNitive (`packages/innfo-mcp/`) y se distribuye como bundle compilado desde GitHub RAW. El Agent Web Bootstrap lo descarga y registra automÃ¡ticamente.

### URLs de especificaciones

```
https://raw.githubusercontent.com/cogNNitive/cogNNitive/main/specs/latest/level0/defiNNe_NN.md
https://raw.githubusercontent.com/cogNNitive/cogNNitive/main/specs/latest/level1/iNNfo_NN.md
https://raw.githubusercontent.com/cogNNitive/cogNNitive/main/specs/latest/level2/{template}/{template}_NN.md
```

---

## DivisiÃ³n de Responsabilidades

| Capa | cogNNitive | actioNN |
|------|-----------|--------------|
| **Rol** | Motor + especificaciones | Instrucciones al agente |
| **Contenido** | TypeScript, specs, tests, editor Vue | SKILL.md declarativos, scripts auxiliares |
| **Testing** | Vitest + Playwright (full suite) | Tests zero-dependency para CLI tools |
| **Output** | Editor web, MCP bundle, docs site | Skills instalables en `~/.agents/skills/` |
| **Versiona** | Specs iNNfo + paquetes npm | Skills individualmente (V_x-y-z) |

La separaciÃ³n es limpia: **cogNNitive define y ejecuta**, actioNN **instruye al agente** para usar lo que cogNNitive expone. El MCP server es la interfaz estable entre ambos.

---

## DocumentaciÃ³n Relacionada

- [`ecosystem-analysis_iNNfo-vs-actioNN.md`](ecosystem-analysis_iNNfo-vs-actioNN.md) â€” AnÃ¡lisis detallado de integraciÃ³n con propuestas de mejora
