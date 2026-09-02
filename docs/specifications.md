---
layout: default
title: Especificaciones iNNfo y Arquitectura de Documentos
description: Cascada de niveles (L0-L3), criterio técnico Front Matter vs. Cuerpo Markdown y lógica de composición de plantillas (includes).
---

# Especificaciones iNNfo y Arquitectura de Documentos

El ecosistema **cogNNitive** estructura el conocimiento a través del sistema de especificaciones **iNNfo**. Cada documento cumple un rol dentro de una cascada de cuatro niveles, donde la información se distribuye rigurosamente entre el **YAML Front Matter** (metadatos de infraestructura) y el **Cuerpo Markdown** (dominio y estructura).

---

## 1. Cascada de Niveles de Especificación

La arquitectura iNNfo define cuatro niveles jerárquicos e inmutables:

| Nivel | Rol | Documento Principal | Propósito y Sintaxis |
|---|---|---|---|
| **Nivel 0** | Meta-especificación | `defiNNe` (`defiNNe_V_0-1-0_NN.md`) | Define las meta-reglas del ecosistema, control de versiones (SemVer) y vocabulario RFC 2119. |
| **Nivel 1** | Especificación Concreta | `iNNfo` (`iNNfo_V_0-2-0_NN.md`) | Especificación adoptada y Metaplantilla Nivel 1. Define la sintaxis `NN` (`# NN`, `## NN`, `key:: value`) y las 4 Primitivas Raíz (`Concept Definition`, `Field Definition`, `Matrix Definition`, `Marker Definition`). |
| **Nivel 2** | Plantillas (Templates / Especializaciones) | `business`, `procedures`, `organization`, etc. | Instancia las 4 Primitivas Raíz para dominios específicos. Declara esquemas reutilizables y dependencias de composición (`includes`). |
| **Nivel 3** | Modelos de Datos | Archivos `*_NN.md` de dominio | Instancias concretas de datos y conceptos. Son documentos ultra livianos (*lean models*) que contienen datos y un puntero de resolución (`parent_spec`). |

---

## 2. Criterio de Distribución: Front Matter vs. Cuerpo Markdown (`# NN`)

La frontera entre el **YAML Front Matter** y el **Cuerpo Markdown (`# NN`)** responde a la pregunta de diseño: *"¿Es una propiedad para el resolver/infraestructura o es parte del modelo de conocimiento?"*.

### YAML Front Matter (Metadatos de Registro e Infraestructura)
Responde a: **"¿Qué es este archivo en el sistema y cómo se resuelve?"**

Es la cabecera liviana que necesitan el resolver (`innfo-core`), el servidor MCP (`innfo-mcp`) y los indexadores antes o sin necesidad de parsear el árbol de contenido completo.

* **Metadatos permitidos**: `level`, `spec_version`, `template_version`, `model_version`, `status`, `title`, `author`, `parent` (apuntador vertical L1), `parent_spec` (apuntador de modelo L3 a plantilla L2), `includes` (composición L2) y `tags` (etiquetas globales de archivo).

### Cuerpo Markdown (Estructura y Dominio de Conocimiento)
Responde a: **"¿Qué esquemas, conceptos, propiedades o instancias contiene este documento?"**

Expresa todo el modelo semántico mediante la sintaxis unificada `NN`:
* **Sección de Concepto (H1)**: `# NN <Concept>`
* **Elemento / Instancia (H2)**: `## NN <Concept>: <Element>`
* **Propiedades de Campo**: `key:: value`
* **Descripciones y Referencias**: Prosa Markdown con WikiLinks `[[Elemento]]`.

---

## 3. Evolución Arquitectónica (V_0-1-0 → V_0-2-0)

En las primeras versiones de la especificación (V_0-1-0), las plantillas de Nivel 2 solían declarar las definiciones de esquemas en bloques de YAML dentro del Front Matter (`concepts: []`, `fields: []`, `matrices: []`).

A partir de **iNNfo V_0-2-0**, **se eliminaron por completo los bloques de esquema del Front Matter**:

1. **Principio *Self-Describing Meta-Template***: Las plantillas de Nivel 2 pasaron a ser documentos iNNfo ordinarios. Su esquema se expresa en el cuerpo instanciando las 4 Primitivas Raíz de Nivel 1 (`# NN Concept Definition`, `# NN Field Definition`, etc.).
2. **Unificación Sintáctica**: No conviven dos gramáticas distintas (YAML para plantillas vs. Markdown/NN para modelos). Todo el ecosistema habla la misma sintaxis unificada `NN`.
3. **Lectura Humana y Git Diffs**: El contenido del cuerpo en Markdown es inmensamente más fácil de auditar, leer y comparar en control de versiones que un bloque YAML anidado.

---

## 4. Lógica de `includes:` en el Front Matter

En plantillas de Nivel 2, la composición de plantillas se realiza mediante la propiedad `includes:` en el **YAML Front Matter**:

```yaml
includes:
  - name: "business-model"
    url: "https://raw.githubusercontent.com/cogNNitive/iNNfo/main/specs/templates/business-model/business-model_V_0-1-0_NN.md"
  - name: "analysis"
    url: "https://raw.githubusercontent.com/cogNNitive/iNNfo/main/specs/templates/analysis/analysis_V_0-1-0_NN.md"
```

### ¿Por qué vive en el Front Matter?
* **Es una declaración de dependencias de infraestructura**: `includes:` equivale a una instrucción `import` o `require` de dependencias externas (*ingredientes*).
* **Resolución Estática del Grafo (DAG)**: Al estar en el Front Matter, el resolver puede construir el Grafo Dirigido Acíclico de dependencias y traer los archivos remotos o locales antes de iniciar el parseo AST del cuerpo del documento.
* **Composición Aditiva Horizontal**: Es una unión aditiva (Plantilla A ∪ Plantilla B). No permite *overrides* ni colisión de nombres (un choque de nombres no idénticos genera error de validación).

---

## Enlaces Relacionados

- [Documentación del Motor iNNfo](https://github.com/cogNNitive/iNNfo/blob/main/docs/documentation/specifications.md)
- [Especificación iNNfo V_0-2-0](https://github.com/cogNNitive/iNNfo/blob/main/specs/iNNfo_V_0-2-0_NN.md)
