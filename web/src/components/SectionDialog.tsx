import { useState, type ComponentType, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

export type DialogSection<S extends string> = { id: S; label: string; Icon: ComponentType<{ className?: string }>; keywords: string };

export function SectionDialog<S extends string>({
  title,
  description,
  sections,
  section,
  onSection,
  onClose,
  children,
}: {
  title: string;
  description: string;
  sections: DialogSection<S>[];
  section?: S;
  onSection: (section?: S) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const key = title.toLowerCase();
  const words = query.trim().toLowerCase();
  const matches = sections.filter((s) => `${s.label} ${s.keywords}`.toLowerCase().includes(words));
  const shown = sections.find((s) => s.id === section);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(48rem,calc(100dvh-2rem))] max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-6xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById(section ? `${key}-section-title` : `${key}-title`)?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          document.getElementById(`open-${key}`)?.focus();
        }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <nav
          aria-label={`${title} sections`}
          className={cn("h-full min-h-0 w-full overflow-y-auto flex-col bg-sidebar md:flex md:w-56 md:flex-none md:border-r md:border-sidebar-border", section ? "hidden" : "flex")}
        >
          <div className="flex h-14 flex-none items-center gap-1 px-4">
            <h1 id={`${key}-title`} tabIndex={-1} className="flex-1 text-lg font-semibold tracking-tight outline-none">
              {title}
            </h1>
            <Button variant="ghost" size="icon" className="rounded-full md:hidden" onClick={onClose} aria-label={`Close ${key}`}>
              <X className="size-5" />
            </Button>
          </div>
          <InputGroup className="mx-3 mb-2 w-auto rounded-xl border-0 bg-black/5 shadow-none has-[[data-slot=input-group-control]:focus-visible]:bg-black/7 dark:bg-input/40 dark:inset-ring dark:inset-ring-input dark:has-[[data-slot=input-group-control]:focus-visible]:bg-input/60">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput value={query} placeholder="Search" aria-label={`Search ${key}`} className="text-[15px]" onChange={(e) => setQuery(e.target.value)} />
          </InputGroup>
          <div className="flex flex-col gap-0.5 px-2">
            {matches.map(({ id, label, Icon }) => (
              <Button
                key={id}
                id={`${key}-nav-${id}`}
                variant="ghost"
                aria-current={id === section ? "page" : undefined}
                className={cn("h-12 justify-start gap-3 rounded-xl px-3 text-[15px] font-normal hover:bg-sidebar-accent/60 md:h-10", id === section && "bg-sidebar-accent hover:bg-sidebar-accent")}
                onClick={() => onSection(id)}
              >
                <Icon className="size-[18px]" />
                <span className="flex-1 text-left">{label}</span>
                <ChevronRight className="text-muted-foreground md:hidden" />
              </Button>
            ))}
            {matches.length === 0 && <p className="mt-10 text-center text-sm text-muted-foreground">Nothing matches "{query}".</p>}
          </div>
        </nav>

        <div className={cn("h-full min-h-0 min-w-0 flex-1 flex-col md:flex", section ? "flex" : "hidden")}>
          <header className="flex h-14 flex-none items-center gap-2 border-b px-3 md:px-6">
            <Button variant="ghost" size="icon" className="rounded-full md:hidden" onClick={() => onSection()} aria-label="Back">
              <ChevronLeft className="size-5" />
            </Button>
            <Breadcrumb className="min-w-0 flex-1">
              <BreadcrumbList className="text-[15px]">
                <BreadcrumbItem>{title}</BreadcrumbItem>
                {shown && (
                  <>
                    <BreadcrumbSeparator>/</BreadcrumbSeparator>
                    <BreadcrumbItem>
                      <BreadcrumbPage className="font-medium">{shown.label}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
            <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose} aria-label={`Close ${key}`} title={`Close ${key}`}>
              <X className="size-5" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {shown && (
              <section aria-label={shown.label} className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-8">
                <h2 id={`${key}-section-title`} tabIndex={-1} className="sr-only">
                  {shown.label}
                </h2>
                {children}
              </section>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
