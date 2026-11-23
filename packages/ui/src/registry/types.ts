export type NavigationSlot = 'sidebar' | 'mobile-tab' | 'tool-drawer';

export interface ToolPanelDefinition {
  id: string;
  labelKey: string;
  defaultLabel: string;
  iconName: string;
  slot: NavigationSlot;
  order: number;
  badgeCount?: number;
}

/**
 * Extensible tool registry enabling future learning panels (error-book export, Anki flashcards,
 * mock exam timer, TTS reader) to mount without rewriting core layout code.
 */
export class ToolPanelRegistry {
  private readonly panels = new Map<string, ToolPanelDefinition>();

  register(panel: ToolPanelDefinition): void {
    this.panels.set(panel.id, panel);
  }

  unregister(panelId: string): boolean {
    return this.panels.delete(panelId);
  }

  listBySlot(slot: NavigationSlot): ToolPanelDefinition[] {
    return Array.from(this.panels.values())
      .filter((panel) => panel.slot === slot)
      .sort((a, b) => a.order - b.order);
  }

  listAll(): ToolPanelDefinition[] {
    return Array.from(this.panels.values()).sort((a, b) => a.order - b.order);
  }
}
