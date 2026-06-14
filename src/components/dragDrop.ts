export function makeDraggable(card: HTMLElement, taskId: string): void {
  card.draggable = true;
  card.addEventListener("dragstart", (e) => {
    e.dataTransfer?.setData("text/plain", taskId);
    card.addClass("af-dragging");
  });
  card.addEventListener("dragend", () => {
    card.removeClass("af-dragging");
  });
}

export function makeDropTarget(column: HTMLElement, onDrop: (taskId: string) => void): void {
  column.addEventListener("dragover", (e) => {
    e.preventDefault();
    column.addClass("af-drag-over");
  });
  column.addEventListener("dragleave", (e) => {
    const related = e.relatedTarget as Node | null;
    if (!related || !column.contains(related)) {
      column.removeClass("af-drag-over");
    }
  });
  column.addEventListener("drop", (e) => {
    e.preventDefault();
    const taskId = e.dataTransfer?.getData("text/plain");
    column.removeClass("af-drag-over");
    if (taskId) {
      onDrop(taskId);
    }
  });
}
