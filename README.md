---
agent-bootstrap:
  version: "1.0"
  skills:
    - name: nn-innfo
      repo: https://github.com/cogNNitive/actioNN
      path: skills/nn-innfo
      description: Crear, editar y validar modelos iNNfo
      mcp:
        - name: innfo-mcp
          url: https://raw.githubusercontent.com/cogNNitive/cogNNitive/main/packages/innfo-mcp/bin/innfo-mcp.bundle.js
    - name: nn-trannsform
      repo: https://github.com/cogNNitive/actioNN
      path: skills/nn-trannsform
      description: Pipeline de transformación de documentos
    - name: nn-workflow-orchestrator
      repo: https://github.com/cogNNitive/actioNN
      path: skills/nn-workflow-orchestrator
      description: Ejecutar flujos multi-skill con stages secuenciales
  workflows:
    - id: cognnitive
      label: "CogNNitive — Crear un modelo iNNfo desde cero"
      description: Elegir template, nombrar modelo, configurar workspace
      skill: nn-innfo
    - id: transform
      label: "traNNsform — Pipeline de transformación de documentos"
      description: Importar/exportar documentos, procesar archivos
      skill: nn-trannsform
---

# eNNvironment

Synopsis, manifest, y punto de entrada del ecosistema iNNv0. Este repo documenta cómo se relacionan los proyectos del ecosistema y sirve como bootstrap para que un AI Agent instale los skills necesarios.

→ Para empezar, decile a tu agente: _"Quiero usar eNNvironment https://innv0.github.io/eNNvironment"_

---

## ¿Qué es eNNvironment?

eNNvironment es la puerta de entrada al ecosistema iNNv0. Le dice al agente qué skills instalar, de dónde descargarlos, y qué flujos de trabajo están disponibles.

### Skills que instala

| Skill | Descripción |
|-------|-------------|
| `nn-innfo` | Crear, editar y validar modelos iNNfo (delega al MCP de cogNNitive) |
| `nn-trannsform` | Pipeline de importación/exportación de documentos |
| `nn-workflow-orchestrator` | Orquestación multi-skill |

### Flujos disponibles

| Opción | Descripción |
|--------|-------------|
| **CogNNitive** | Crear un modelo iNNfo desde cero: elegir template, nombrar, configurar workspace |
| **traNNsform** | Pipeline de transformación de documentos: importar/exportar, procesar archivos |

---

## ¿Cómo funciona?

```
Usuario: "Quiero usar eNNvironment <URL>"
         │
         ▼
Agent Web Bootstrap Skill
  ├─ Fetch URL → parsea YAML frontmatter
  ├─ Descarga skills desde GitHub
  ├─ Si el skill declara MCP: descarga bundle + registra en opencode.json
  ├─ Valida con skill-origin-guard
  └─ Presenta menú de workflows
```

El bootstrap se encarga de todo: descarga, instalación, validación y registro de MCP. Solo se ejecuta una vez; la próxima vez los skills ya están disponibles.

---

## cogNNitive — Motor de iNNfo

**Propósito**: Hub de especificaciones, tooling y motor del ecosistema [iNNfo](https://github.com/cogNNitive/cogNNitive).

- Define las especificaciones iNNfo (niveles 0-2: defiNNe, iNNfo, templates)
- Implementa `@innv0/innfo-core` — parser, validador, resolvedor de cadenas de specs
- Provee `@innv0/innfo-mcp` — servidor MCP que expone tools determinísticas para AI agents
- Incluye **iNNfo Modeler** — editor Vue 3 SPA para modelos iNNfo
- Pipeline de validación CI (`pipeline-gates`)

## actioNN — Skills de Agente

**Propósito**: Colección modular de skills para OpenCode (y agentes compatibles) que enseñan al AI agent a trabajar con el ecosistema iNNfo.

Skills disponibles en https://github.com/cogNNitive/actioNN

---

## Cómo se Integran

```
AI Agent → actioNN (instrucciones) → innfo-mcp (MCP server) → @innv0/innfo-core
                                                                       ↓
                                                           Specs en GitHub RAW
                                                           (cogNNitive/specs/latest/)
```

### Punto de integración principal: innfo-mcp

El MCP server es el puente. Vive en cogNNitive (`packages/innfo-mcp/`) y se distribuye como bundle compilado desde GitHub RAW. El Agent Web Bootstrap lo descarga y registra automáticamente.

### URLs de especificaciones

```
https://raw.githubusercontent.com/cogNNitive/cogNNitive/main/specs/latest/level0/defiNNe_NN.md
https://raw.githubusercontent.com/cogNNitive/cogNNitive/main/specs/latest/level1/iNNfo_NN.md
https://raw.githubusercontent.com/cogNNitive/cogNNitive/main/specs/latest/level2/{template}/{template}_NN.md
```

---

## División de Responsabilidades

| Capa | cogNNitive | actioNN |
|------|-----------|--------------|
| **Rol** | Motor + especificaciones | Instrucciones al agente |
| **Contenido** | TypeScript, specs, tests, editor Vue | SKILL.md declarativos, scripts auxiliares |
| **Testing** | Vitest + Playwright (full suite) | Tests zero-dependency para CLI tools |
| **Output** | Editor web, MCP bundle, docs site | Skills instalables en `~/.agents/skills/` |
| **Versiona** | Specs iNNfo + paquetes npm | Skills individualmente (V_x-y-z) |

La separación es limpia: **cogNNitive define y ejecuta**, actioNN **instruye al agente** para usar lo que cogNNitive expone. El MCP server es la interfaz estable entre ambos.

---

## Documentación Relacionada

- [`ecosystem-analysis_cogNNitive-vs-actioNN.md`](ecosystem-analysis_cogNNitive-vs-iNNv0_skills.md) — Análisis detallado de integración con propuestas de mejora
