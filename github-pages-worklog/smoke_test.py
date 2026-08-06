from pathlib import Path

ROOT = Path(__file__).parent
REQUIRED = ["index.html", "styles.css", "app.js", "config.js", "README.md", "package.json"]


def main() -> int:
    missing = [name for name in REQUIRED if not (ROOT / name).exists()]
    if missing:
        print("Missing files:")
        for name in missing:
            print(" -", name)
        return 1
    print("Smoke test passed: all expected files exist.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

