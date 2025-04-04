import fs from 'fs';

/**
 * Parse the ECS codebase to extract entity/component graph.
 */
export function parseEcsCodebase() {
  const componentsSrc = fs.readFileSync('src/components.ts', 'utf-8');
  const indexSrc = fs.readFileSync('src/index.ts', 'utf-8');

  const componentRegex = /export const (\w+)\s*=\s*defComponent\([^]*?\);/gm;
  const components = {};
  let match;
  while ((match = componentRegex.exec(componentsSrc)) !== null) {
    const name = match[1];
    const def = match[0];

    const isMarker = def.includes('Marker');
    const isText = def.includes('LoroText');
    const isMap = def.includes('LoroMap');
    const isList = def.includes('LoroList');
    const isMovableList = def.includes('LoroMovableList');

    const referencesEntity = def.includes('EntityIdStr');

    components[name] = {
      name,
      isMarker,
      isText,
      isMap,
      isList,
      isMovableList,
      referencesEntity,
    };
  }

  const classRegex = /export class (\w+)[^{]*{([^]*?)}\n}/gm;
  const entities = {};
  while ((match = classRegex.exec(indexSrc)) !== null) {
    const className = match[1];
    const body = match[2];

    const componentUses = [];
    for (const compName of Object.keys(components)) {
      const regex = new RegExp(`c\\.${compName}\\b`);
      if (regex.test(body)) {
        componentUses.push(compName);
      }
    }

    entities[className] = {
      name: className,
      components: componentUses,
    };
  }

  const graph = { entities: [] };
  for (const [entityName, entityData] of Object.entries(entities)) {
    const slots = [];
    const links = [];

    for (const compName of entityData.components) {
      const comp = components[compName];
      slots.push({
        name: compName,
        referencesEntity: comp.referencesEntity,
      });
      if (comp.referencesEntity) {
        links.push(compName);
      }
    }

    graph.entities.push({
      name: entityName,
      components: slots,
      links,
    });
  }

  return graph;
}

/**
 * Generate diagram data with hierarchical positions from ECS graph JSON.
 */
export function generateDiagramData(graph) {
  const diagramEntities = [];

  const levels = {
    Space: 0,
    Category: 1,
    Channel: 1,
    Thread: 2,
    Message: 3,
    Image: 4,
    WikiPage: 2,
    Announcement: 3,
    TimelineItem: 3,
    Reactions: 4,
  };

  const levelGroups = {};
  graph.entities.forEach(e => {
    const level = levels[e.name] ?? 5;
    if (!levelGroups[level]) levelGroups[level] = [];
    levelGroups[level].push(e);
  });

  Object.entries(levelGroups).forEach(([levelStr, entitiesAtLevel]) => {
    const level = parseInt(levelStr);
    const y = 100 + level * 250;
    entitiesAtLevel.forEach((entity, idx) => {
      const x = 150 + idx * 250;
      diagramEntities.push({
        id: entity.name,
        label: entity.name,
        x,
        y,
        components: entity.components.map(c => ({
          name: c.name,
          linksTo: [],
        })),
      });
    });
  });

  const nameToEntity = {};
  diagramEntities.forEach(e => (nameToEntity[e.id] = e));

  const componentTargets = {
    Channels: ['Channel'],
    SidebarItems: ['Channel', 'Category'],
    Threads: ['Thread'],
    Timeline: ['Message', 'Announcement', 'TimelineItem'],
    ReplyTo: ['Message'],
    Images: ['Image'],
    WikiPages: ['WikiPage'],
  };

  graph.entities.forEach(entity => {
    const diagramEntity = nameToEntity[entity.name];
    entity.components.forEach((comp, idx) => {
      if (comp.referencesEntity) {
        const targets = componentTargets[comp.name] || [];
        const targetNames = graph.entities
          .filter(e => targets.includes(e.name) && e.name !== entity.name)
          .map(e => e.name);
        diagramEntity.components[idx].linksTo = targetNames;
      }
    });
  });

  return diagramEntities;
}

/**
 * Draws an ECS Entity-Component relationship diagram.
 */
export function drawEcsDiagram(svgOrSelector, entities, options = {}) {
  const svg = typeof svgOrSelector === 'string' ? document.querySelector(svgOrSelector) : svgOrSelector;
  if (!svg) throw new Error('SVG element not found');

  svg.innerHTML = '';

  const colorMap = options.colorMap || {
    'Channels': '#2196f3',
    'SidebarItems': '#009688',
    'Threads': '#ff9800',
    'Timeline': '#9c27b0',
    'ReplyTo': '#f44336',
    'Images': '#4caf50',
  };

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  Object.entries(colorMap).forEach(([key, color]) => {
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", `arrowhead-${key}`);
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("refX", "10");
    marker.setAttribute("refY", "3.5");
    marker.setAttribute("orient", "auto");
    marker.setAttribute("markerUnits", "strokeWidth");
    marker.innerHTML = `<polygon points="0 0, 10 3.5, 0 7" fill="${color}" />`;
    defs.appendChild(marker);
  });
  svg.appendChild(defs);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  entities.forEach(ent => {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("transform", `translate(${ent.x}, ${ent.y})`);

    const width = 110;
    const height = 50 + ent.components.length * 25;

    minX = Math.min(minX, ent.x - width/2 - 20);
    maxX = Math.max(maxX, ent.x + width/2 + 20);
    minY = Math.min(minY, ent.y - height/2 - 20);
    maxY = Math.max(maxY, ent.y + height/2 + 20);

    const entityBox = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    entityBox.setAttribute("x", -width/2);
    entityBox.setAttribute("y", -height/2);
    entityBox.setAttribute("width", width);
    entityBox.setAttribute("height", height);
    entityBox.setAttribute("class", "entity");
    group.appendChild(entityBox);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("class", "label");
    label.setAttribute("x", 0);
    label.setAttribute("y", -height/2 + 15);
    label.textContent = ent.label;
    group.appendChild(label);

    ent.components.forEach((comp, idx) => {
      const slotWidth = width - 20;
      const slotHeight = 20;
      const slotX = -slotWidth/2;
      const slotY = -height/2 + 30 + idx * 25;

      const slot = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      slot.setAttribute("x", slotX);
      slot.setAttribute("y", slotY);
      slot.setAttribute("width", slotWidth);
      slot.setAttribute("height", slotHeight);
      slot.setAttribute("class", "component-slot");
      group.appendChild(slot);

      const slotLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      slotLabel.setAttribute("class", "label");
      slotLabel.setAttribute("x", 0);
      slotLabel.setAttribute("y", slotY + slotHeight/2);
      slotLabel.textContent = comp.name;
      group.appendChild(slotLabel);

      comp._pos = {
        x: ent.x,
        y: ent.y + slotY + slotHeight/2
      };
    });

    svg.appendChild(group);
  });

  const padding = 50;
  svg.setAttribute('viewBox', `${minX - padding} ${minY - padding} ${maxX - minX + 2*padding} ${maxY - minY + 2*padding}`);
  svg.style.width = '100%';
  svg.style.height = '100vh';

  function getEntityPos(entityId) {
    const ent = entities.find(e => e.id === entityId);
    return ent ? { x: ent.x, y: ent.y } : null;
  }

  entities.forEach(ent => {
    ent.components.forEach(comp => {
      comp.linksTo.forEach(targetId => {
        const from = comp._pos;
        const to = getEntityPos(targetId);
        if (!from || !to) return;

        const offset = 10;
        const startX = from.x;
        const startY = from.y + offset;
        const endX = to.x;
        const endY = to.y - offset;

        const ctrlX = (startX + endX) / 2;
        const ctrlY = (startY + endY) / 2 - 40;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`);
        path.setAttribute("class", "arrow");

        const color = colorMap[comp.name] || '#666';
        path.setAttribute("stroke", color);
        path.setAttribute("marker-end", `url(#arrowhead-${comp.name})`);

        svg.appendChild(path);
      });
    });
  });
}

/**
 * Generate a standalone HTML file visualizing the ECS graph.
 */
export function generateHtml(outputPath = 'ecs_diagram_generated.html') {
  const graph = parseEcsCodebase();
  const diagramData = generateDiagramData(graph);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Entity-Component Relationship Diagram</title>
<style>
  body { font-family: sans-serif; background: #f9f9f9; margin: 0; padding: 0; }
  svg { width: 100%; height: 100vh; background: #fff; border: 1px solid #ccc; }
  .entity { stroke: #333; stroke-width: 2; fill: #e0f7fa; rx: 10; ry: 10; }
  .component-slot { stroke: #666; stroke-width: 1.5; fill: #fff; rx: 5; ry: 5; }
  .label { font-size: 12px; text-anchor: middle; dominant-baseline: middle; pointer-events: none; }
  .arrow { stroke-width: 1.5; fill: none; }
</style>
</head>
<body>
<svg id="diagram"></svg>
<script>
const diagramData = ${JSON.stringify(diagramData, null, 2)};

(${drawEcsDiagram.toString()})('#diagram', diagramData);
</script>
</body>
</html>
`;

  fs.writeFileSync(outputPath, html, 'utf-8');
  console.log('Generated', outputPath);
}

generateHtml()