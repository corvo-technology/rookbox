/**
 * The Gate glyph from Logo.astro on a 16 x 20 pixel grid. `#` is a wall pixel, `o` is the doorway
 * (dark until the machine is "ready"). Shared by the hero castle and the small one in the demo.
 */
export const GRID = [
  "####..####..####",
  "####..####..####",
  "####..####..####",
  "################",
  "################",
  "................",
  "################",
  "################",
  "################",
  "################",
  "######oooo######",
  "#####oooooo#####",
  "#####oooooo#####",
  "#####oooooo#####",
  "#####oooooo#####",
  "#####oooooo#####",
  "#####oooooo#####",
  "#####oooooo#####",
  "#####oooooo#####",
  "#####oooooo#####",
];

export const ROWS = GRID.length;
export const COLS = GRID[0]?.length ?? 0;

export type Cell = { x: number; y: number; door: boolean; rank: number | undefined };

/**
 * Every pixel of the castle. Wall pixels get a build rank: the foundation first, each row from the
 * middle outwards, so "30% lit" always reads as a building that is going up. Doorway pixels have none.
 */
export function buildCells(): Cell[] {
  const cells: Cell[] = [];
  GRID.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch !== ".") cells.push({ x, y, door: ch === "o", rank: undefined });
    });
  });
  const order = (cell: Cell) => (ROWS - 1 - cell.y) * COLS + Math.abs(cell.x - (COLS - 1) / 2) * 2;
  const walls = cells.filter((cell) => !cell.door).sort((a, b) => order(a) - order(b));
  walls.forEach((cell, i) => {
    cell.rank = i;
  });
  return cells;
}
