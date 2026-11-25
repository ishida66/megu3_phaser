// Home walkable-area and furniture-placement geometry helpers.
// Furniture exclusion polygon: furniture bottom-center points may not enter this area.
const HOME_WALKABLE_POLYGON = Object.freeze([
  {x:140,y:480},
  {x:500,y:480},
  {x:640,y:650},
  {x:0,y:650}
]);
// Independent hard placement boundary: furniture anchor Y must remain < 630px.
const HOME_FURNITURE_MAX_Y = 629;
function isInsideHomeWalkableArea(x, y) {
  let inside = false;
  const points = HOME_WALKABLE_POLYGON;
  for (let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i], b=points[j];
    if (((a.y>y)!==(b.y>y)) && x < (b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside || points.some((point,index)=>{
    const next=points[(index+1)%points.length];
    const cross=(x-point.x)*(next.y-point.y)-(y-point.y)*(next.x-point.x);
    const dot=(x-point.x)*(next.x-point.x)+(y-point.y)*(next.y-point.y);
    const lengthSq=(next.x-point.x)**2+(next.y-point.y)**2;
    return Math.abs(cross)<1e-6 && dot>=0 && dot<=lengthSq;
  });
}
function slideFurnitureCenterOutsideHomeWalkableArea(targetCenterX, targetCenterY, maxCenterY) {
  // Both constraints are resolved together: the furniture bottom-center point must remain
  // outside the walkable polygon AND at/before the independent bottom limit.
  const yLimit = Number.isFinite(maxCenterY) ? maxCenterY : 629;
  const target = { x: targetCenterX, y: Math.min(targetCenterY, yLimit) };
  if (!isInsideHomeWalkableArea(target.x, target.y)) return target;

  const polygon = HOME_WALKABLE_POLYGON;
  const epsilon = 0.75;
  const polygonCenter = {
    x: polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length,
    y: polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length
  };
  let best = null;
  let bestDistanceSq = Infinity;

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq <= 0) continue;

    // Clip each polygon edge to the allowed center-Y range before projecting.
    let tMin = 0, tMax = 1;
    if (Math.abs(dy) < 1e-9) {
      if (a.y > yLimit) continue;
    } else {
      const tAtLimit = (yLimit - a.y) / dy;
      if (dy > 0) tMax = Math.min(tMax, tAtLimit);
      else tMin = Math.max(tMin, tAtLimit);
    }
    tMin = Phaser.Math.Clamp(tMin, 0, 1);
    tMax = Phaser.Math.Clamp(tMax, 0, 1);
    if (tMin > tMax) continue;

    const rawT = ((target.x - a.x) * dx + (target.y - a.y) * dy) / lengthSq;
    const t = Phaser.Math.Clamp(rawT, tMin, tMax);
    const edgeX = a.x + t * dx;
    const edgeY = a.y + t * dy;
    const length = Math.sqrt(lengthSq);
    const normals = [
      { x: dy / length, y: -dx / length },
      { x: -dy / length, y: dx / length }
    ];
    for (const normal of normals) {
      const candidate = { x: edgeX + normal.x * epsilon, y: edgeY + normal.y * epsilon };
      if (candidate.y > yLimit || isInsideHomeWalkableArea(candidate.x, candidate.y)) continue;
      const distanceSq = (candidate.x - target.x) ** 2 + (candidate.y - target.y) ** 2;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = candidate;
      }
    }
  }

  // A valid solution must exist for the supplied polygon and limit. This
  // fallback searches just outside its left/right sides at the capped height.
  if (!best) {
    const candidates = [
      { x: -epsilon, y: yLimit },
      { x: 640 + epsilon, y: yLimit },
      { x: target.x, y: Math.min(479, yLimit) }
    ].filter(point => point.y <= yLimit && !isInsideHomeWalkableArea(point.x, point.y));
    candidates.sort((a, b) => ((a.x-target.x)**2+(a.y-target.y)**2) - ((b.x-target.x)**2+(b.y-target.y)**2));
    best = candidates[0] || { x: target.x, y: Math.min(479, yLimit) };
  }
  return best;
}

function randomHomeWalkablePoint() {
  for(let i=0;i<100;i++){
    const x=Phaser.Math.Between(0,640), y=Phaser.Math.Between(480,640);
    if(isInsideHomeWalkableArea(x,y)) return {x,y};
  }
  return {x:320,y:560};
}
