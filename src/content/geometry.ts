import { GAME } from '../game/config';
import type { ObstacleConfig, Point, StageConfig } from '../game/types';

export function circleClearOfObstacle(point: Point, obstacle: ObstacleConfig, radius: number, margin = 0) {
  const angle = -(obstacle.angle ?? 0);
  const dx = point.x - obstacle.position.x;
  const dy = point.y - obstacle.position.y;
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
  return Math.abs(localX) > obstacle.width / 2 + radius + margin
    || Math.abs(localY) > obstacle.height / 2 + radius + margin;
}

export function hasRouteToFlippers(
  stage: StageConfig,
  enemyRadius: number,
  bumperRadius: number,
  options: { grid?: number; margin?: number; targetY?: number } = {},
) {
  const grid = options.grid ?? 10;
  const margin = options.margin ?? 3;
  const targetY = options.targetY ?? 990;
  const minX = GAME.playfieldLeft + enemyRadius + margin;
  const maxX = GAME.playfieldRight - enemyRadius - margin;
  const minY = 145;
  const maxY = targetY;
  const columns = Math.floor((maxX - minX) / grid) + 1;
  const rows = Math.floor((maxY - minY) / grid) + 1;
  const key = (column: number, row: number) => row * columns + column;
  const clear = (column: number, row: number) => {
    const point = { x: minX + column * grid, y: minY + row * grid };
    if (stage.obstacles.some(obstacle => !circleClearOfObstacle(point, obstacle, enemyRadius, margin))) return false;
    return stage.sockets.every(socket => Math.hypot(point.x - socket.position.x, point.y - socket.position.y) > enemyRadius + bumperRadius + margin);
  };

  const queue: Array<[number, number]> = [];
  const visited = new Set<number>();
  for (const gate of stage.spawnGates) {
    const column = Math.max(0, Math.min(columns - 1, Math.round((gate.position.x - minX) / grid)));
    for (let offset = -2; offset <= 2; offset++) {
      const candidate = column + offset;
      if (candidate >= 0 && candidate < columns && clear(candidate, 0)) {
        queue.push([candidate, 0]); visited.add(key(candidate, 0));
      }
    }
  }

  const directions = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]] as const;
  for (let index = 0; index < queue.length; index++) {
    const [column, row] = queue[index];
    if (minY + row * grid >= targetY - grid) return true;
    for (const [dx, dy] of directions) {
      const nextColumn = column + dx; const nextRow = row + dy;
      if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) continue;
      const id = key(nextColumn, nextRow);
      if (visited.has(id) || !clear(nextColumn, nextRow)) continue;
      if (dx && dy && (!clear(column + dx, row) || !clear(column, row + dy))) continue;
      visited.add(id); queue.push([nextColumn, nextRow]);
    }
  }
  return false;
}
