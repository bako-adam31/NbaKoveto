import { useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronDown, CircleDot, Menu, X } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { GamesDropdown, TeamsDropdown } from "./NavDropdown";

type DropdownName = "games" | "teams";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<DropdownName | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const gamesButton = useRef<HTMLButtonElement>(null);
  const teamsButton = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setOpenDropdown(null);
        setMobileOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        const focusTarget =
          openDropdown === "games" ? gamesButton.current : teamsButton.current;
        setOpenDropdown(null);
        if (focusTarget) focusTarget.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openDropdown]);

  useEffect(() => {
    setOpenDropdown(null);
    setMobileOpen(false);
  }, [location.pathname]);

  const toggle = (name: DropdownName) => {
    if (window.matchMedia("(hover: hover)").matches) {
      setOpenDropdown(name);
    } else {
      setOpenDropdown((current) => (current === name ? null : name));
    }
  };
  const openFromKeyboard =
    (name: DropdownName) => (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ArrowDown") return;
      event.preventDefault();
      setOpenDropdown(name);
      requestAnimationFrame(() => {
        const panelId = name === "games" ? "games-dropdown" : "teams-dropdown";
        const firstItemSelector =
          name === "games" ? ".nav-game-row" : ".team-dropdown-entry";
        const panel = document.getElementById(panelId);
        (
          panel?.querySelector<HTMLElement>(firstItemSelector) ??
          panel?.querySelector<HTMLElement>("a, button")
        )?.focus();
      });
    };
  const closeOnBlur = (event: FocusEvent<HTMLDivElement>) => {
    const related = event.relatedTarget as
      | (Node & { closest?: (selector: string) => Element | null })
      | null;
    if (event.currentTarget.contains(related)) return;
    if (related?.closest?.(".nav-dropdown-item")) return;
    setOpenDropdown(null);
  };
  const closeForMouseLeave = () => {
    if (window.matchMedia("(hover: hover)").matches) setOpenDropdown(null);
  };
  const activeClass = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`) ? "nav-link active" : "nav-link";

  return (
    <header className="site-header" ref={headerRef}>
      <div className="header-inner">
        <Link
          to="/"
          className="brand"
          onClick={() => {
            setOpenDropdown(null);
            setMobileOpen(false);
          }}
        >
          <span className="brand-mark">
            <CircleDot size={23} />
          </span>
          <span>
            The Daily <b>Dunk</b>
          </span>
        </Link>
        <button
          className="menu-toggle"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          aria-controls="primary-navigation"
          onClick={() => {
            setMobileOpen((value) => !value);
            setOpenDropdown(null);
          }}
        >
          {mobileOpen ? <X /> : <Menu />}
        </button>
        <nav
          id="primary-navigation"
          className={mobileOpen ? "nav open" : "nav"}
          aria-label="Main navigation"
        >
          <NavLink
            end
            to="/"
            onClick={() => {
              setOpenDropdown(null);
              setMobileOpen(false);
            }}
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Home
          </NavLink>
          <div
            className="nav-item nav-dropdown-item"
            onMouseEnter={() => setOpenDropdown("games")}
            onMouseLeave={closeForMouseLeave}
            onBlur={closeOnBlur}
          >
            <button
              ref={gamesButton}
              type="button"
              className={`${activeClass("/games")} nav-trigger`}
              aria-haspopup="true"
              aria-expanded={openDropdown === "games"}
              aria-controls="games-dropdown"
              onClick={() => toggle("games")}
              onKeyDown={openFromKeyboard("games")}
            >
              Games <ChevronDown size={13} aria-hidden="true" />
            </button>
            {openDropdown === "games" && <GamesDropdown enabled />}
          </div>
          <NavLink
            to="/players"
            onClick={() => {
              setOpenDropdown(null);
              setMobileOpen(false);
            }}
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Players
          </NavLink>
          <div
            className="nav-item nav-dropdown-item"
            onMouseEnter={() => setOpenDropdown("teams")}
            onMouseLeave={closeForMouseLeave}
            onBlur={closeOnBlur}
          >
            <button
              ref={teamsButton}
              type="button"
              className={`${activeClass("/teams")} nav-trigger`}
              aria-haspopup="true"
              aria-expanded={openDropdown === "teams"}
              aria-controls="teams-dropdown"
              onClick={() => toggle("teams")}
              onKeyDown={openFromKeyboard("teams")}
            >
              Teams <ChevronDown size={13} aria-hidden="true" />
            </button>
            {openDropdown === "teams" && <TeamsDropdown enabled />}
          </div>
          <NavLink
            to="/stats"
            onClick={() => {
              setOpenDropdown(null);
              setMobileOpen(false);
            }}
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Stats
          </NavLink>
        </nav>
        <span className="header-tag">THE GAME, EVERY DAY</span>
      </div>
    </header>
  );
}
