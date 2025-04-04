import fs from 'fs';

// Read components.ts
const componentsSrc = fs.readFileSync('src/components.ts', 'utf-8');
// Read index.ts
const indexSrc = fs.readFileSync('src/index.ts', 'utf-8');

// Extract component definitions
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

// Extract entity classes and their components
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

// Build graph JSON
const graph = {
  entities: [],
};

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

fs.writeFileSync('ecs_graph.json', JSON.stringify(graph, null, 2), 'utf-8');

console.log('Generated ecs_graph.json');