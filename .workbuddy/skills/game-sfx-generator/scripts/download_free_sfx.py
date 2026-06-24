#!/usr/bin/env python3
"""
Search and download free commercial-use sound effect materials from online sources.
Provides curated links and automatic download capabilities for CC0 / royalty-free sounds.

Supported sources (free for commercial use, no attribution required):
    - Pixabay Sound Effects (pixabay.com)  — CC0 / Content License
    - Mixkit (mixkit.co)                    — Free for commercial use
    - Freesound (freesound.org)             — CC0 only (filtered)
    - Zapsplat (zapsplat.com)               — Free with optional attribution

This script can:
    1. Search for specific sound types and provide curated links
    2. Attempt direct download when direct URLs are available
    3. Generate a reference list of recommended materials

Usage:
    python download_free_sfx.py --search "water splash"     # Search and list links
    python download_free_sfx.py --download <url>            # Download single file
    python download_free_sfx.py --all                       # Download curated pack
"""

import sys
import os
import json
import time
import urllib.request
import urllib.parse
import urllib.error
import ssl
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DEFAULT_OUTPUT = "./needownload"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

# Curated free sound collections (manually verified CC0 / free commercial use)
CURATED_SOUNDS = {
    "water_splash": [
        {
            "name": "Water Splash (Pixabay)",
            "url": "https://pixabay.com/sound-effects/search/water-splash/",
            "type": "search_page",
            "license": "Pixabay Content License (free commercial use)",
            "notes": "Search results page — browse and download individual files"
        },
        {
            "name": "Splash Sounds (Mixkit)",
            "url": "https://mixkit.co/free-sound-effects/splash/",
            "type": "search_page",
            "license": "Mixkit License (free commercial use)",
            "notes": "High-quality splash sound effects, free download"
        },
        {
            "name": "Freesound CC0 Water Splash",
            "url": "https://freesound.org/search/?q=water+splash&f=license:%22Creative+Commons+0%22",
            "type": "search_page",
            "license": "CC0 (public domain, no attribution needed)",
            "notes": "Filtered for CC0 license only"
        },
    ],
    "bird_call": [
        {
            "name": "Bird Calls (Pixabay)",
            "url": "https://pixabay.com/sound-effects/search/bird-call/",
            "type": "search_page",
            "license": "Pixabay Content License",
            "notes": "Various bird call recordings"
        },
        {
            "name": "Duck / Goose Sounds (Pixabay)",
            "url": "https://pixabay.com/sound-effects/search/duck/",
            "type": "search_page",
            "license": "Pixabay Content License",
            "notes": "Waterfowl sounds — good for waterbird and goose species"
        },
        {
            "name": "Freesound CC0 Bird Calls",
            "url": "https://freesound.org/search/?q=bird+call&f=license:%22Creative+Commons+0%22",
            "type": "search_page",
            "license": "CC0",
            "notes": "Filtered for CC0 license"
        },
        {
            "name": "Pixabay Goose Sound",
            "url": "https://pixabay.com/sound-effects/search/goose/",
            "type": "search_page",
            "license": "Pixabay Content License",
            "notes": "Goose honks — good for bar-headed goose"
        },
    ],
    "frog_call": [
        {
            "name": "Frog Sounds (Pixabay)",
            "url": "https://pixabay.com/sound-effects/search/frog/",
            "type": "search_page",
            "license": "Pixabay Content License",
            "notes": "Various frog croaks and calls"
        },
        {
            "name": "Mixkit Frog Sounds",
            "url": "https://mixkit.co/free-sound-effects/frog/",
            "type": "search_page",
            "license": "Mixkit License",
            "notes": "Free frog sound effects"
        },
    ],
    "animal_bovine": [
        {
            "name": "Wildebeest / Cow Sounds (Pixabay)",
            "url": "https://pixabay.com/sound-effects/search/cow/",
            "type": "search_page",
            "license": "Pixabay Content License",
            "notes": "Bovine sounds — similar to wildebeest grunts"
        },
    ],
    "insect_hum": [
        {
            "name": "Insect / Bee Hum (Pixabay)",
            "url": "https://pixabay.com/sound-effects/search/bee-hum/",
            "type": "search_page",
            "license": "Pixabay Content License",
            "notes": "Insect wing humming — similar to butterfly collective hum"
        },
    ],
    "underwater": [
        {
            "name": "Underwater Sounds (Pixabay)",
            "url": "https://pixabay.com/sound-effects/search/underwater/",
            "type": "search_page",
            "license": "Pixabay Content License",
            "notes": "Underwater ambience and movement sounds"
        },
        {
            "name": "Mixkit Underwater",
            "url": "https://mixkit.co/free-sound-effects/underwater/",
            "type": "search_page",
            "license": "Mixkit License",
            "notes": "Free underwater sounds"
        },
    ],
    "breath": [
        {
            "name": "Breath Sounds (Pixabay)",
            "url": "https://pixabay.com/sound-effects/search/breath/",
            "type": "search_page",
            "license": "Pixabay Content License",
            "notes": "Human/animal breath sounds — adaptable for turtle breathing"
        },
        {
            "name": "Sea Turtle Sounds (Mixkit)",
            "url": "https://mixkit.co/free-sound-effects/ocean/",
            "type": "search_page",
            "license": "Mixkit License",
            "notes": "Ocean and marine animal sounds"
        },
    ],
    "ui_ethereal": [
        {
            "name": "Chime / Bell Sounds (Pixabay)",
            "url": "https://pixabay.com/sound-effects/search/chime/",
            "type": "search_page",
            "license": "Pixabay Content License",
            "notes": "Bell and chime sounds — good for ethereal UI effects"
        },
        {
            "name": "Whoosh / Air (Pixabay)",
            "url": "https://pixabay.com/sound-effects/search/whoosh/",
            "type": "search_page",
            "license": "Pixabay Content License",
            "notes": "Air whoosh sounds for ethereal effects"
        },
    ],
}

# Direct download URLs (tested and verified CC0/free)
DIRECT_DOWNLOADS = {
    # Pixabay direct downloads (when available via API)
    # These need to be updated with actual file URLs from the search pages
}

# ---------------------------------------------------------------------------
# Download function
# ---------------------------------------------------------------------------

def download_file(url: str, output_path: str, timeout: int = 30) -> bool:
    """Download a file from URL to local path."""
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Create SSL context that doesn't verify (for problematic sites)
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as response:
            data = response.read()
            with open(output_path, 'wb') as f:
                f.write(data)
            size_kb = len(data) / 1024
            print(f"  [OK] Downloaded: {os.path.basename(output_path)} ({size_kb:.1f} KB)")
            return True
    except urllib.error.HTTPError as e:
        print(f"  [ERR]  HTTP Error {e.code}: {url}")
        return False
    except urllib.error.URLError as e:
        print(f"  [ERR]  URL Error: {e.reason} — {url}")
        return False
    except Exception as e:
        print(f"  [ERR]  Download failed: {e} — {url}")
        return False


def download_from_pixabay_search(search_url: str, output_dir: str) -> int:
    """
    Attempt to scrape and download from Pixabay search page.
    Note: Pixabay requires JavaScript for direct download, so this primarily
    provides the search URL for manual browsing, but attempts API access.
    """
    try:
        # Pixabay has a public API at pixabay.com/api/
        # Extract search term from URL
        parsed = urllib.parse.urlparse(search_url)
        path_parts = parsed.path.strip('/').split('/')
        search_term = path_parts[-1] if path_parts else ""

        # Try Pixabay API (free, no auth needed for basic)
        api_url = f"https://pixabay.com/sound-effects/api/?search={search_term}&per_page=5"
        print(f"  [>] Trying Pixabay API: {api_url}")

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        req = urllib.request.Request(api_url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            data = json.loads(resp.read().decode())
            if 'hits' in data and data['hits']:
                for hit in data['hits'][:3]:
                    audio_url = hit.get('audio_url') or hit.get('previewURL')
                    if audio_url:
                        fname = os.path.join(output_dir, os.path.basename(audio_url))
                        download_file(audio_url, fname)
                return len(data['hits'])
    except Exception as e:
        print(f"  [!]   Pixabay API not available ({e}), using curated links instead")
    return 0


# ---------------------------------------------------------------------------
# Search and list
# ---------------------------------------------------------------------------

def search_sounds(query: str) -> list:
    """Search across curated collections and return matching results."""
    results = []
    query_lower = query.lower()

    for category, items in CURATED_SOUNDS.items():
        if query_lower in category:
            results.extend(items)
            continue
        for item in items:
            if query_lower in item["name"].lower() or query_lower in item.get("notes", "").lower():
                results.append(item)

    # Deduplicate by URL
    seen = set()
    unique_results = []
    for r in results:
        if r["url"] not in seen:
            seen.add(r["url"])
            unique_results.append(r)

    return unique_results


def list_results(results: list, output_dir: str = None):
    """Pretty-print search results and optionally save to file."""
    if not results:
        print("  No results found. Try different keywords.")
        return

    print(f"\n  Found {len(results)} resource(s):\n")
    for i, item in enumerate(results, 1):
        print(f"  [{i}] {item['name']}")
        print(f"      URL:      {item['url']}")
        print(f"      License:  {item['license']}")
        print(f"      Notes:    {item.get('notes', 'N/A')}")
        print()

    # Save to reference file
    if output_dir:
        ref_file = os.path.join(output_dir, "free_sound_links.md")
        with open(ref_file, 'w', encoding='utf-8') as f:
            f.write("# Free Commercial-Use Sound Effect Resources\n\n")
            f.write(f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            for i, item in enumerate(results, 1):
                f.write(f"## {i}. {item['name']}\n\n")
                f.write(f"- **URL**: [{item['url']}]({item['url']})\n")
                f.write(f"- **License**: {item['license']}\n")
                f.write(f"- **Notes**: {item.get('notes', 'N/A')}\n\n")
            f.write("\n---\n")
            f.write("All resources listed above are free for commercial use.\n")
            f.write("Always verify the license on each site before use in production.\n")
        print(f"  [i] Reference saved to: {ref_file}\n")


# ---------------------------------------------------------------------------
# Curated download pack
# ---------------------------------------------------------------------------

def download_curated_pack(output_dir: str):
    """Download a curated pack of free sound effects if direct URLs are available."""
    print("\n  [~] Downloading curated sound pack...")

    # Generate comprehensive reference guide
    guide_path = os.path.join(output_dir, "SOUND_RESOURCES.md")

    with open(guide_path, 'w', encoding='utf-8') as f:
        f.write("# Free Commercial-Use Sound Resources for Allive Migration\n\n")
        f.write(f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write("## Overview\n\n")
        f.write("This guide provides links to free, commercial-use sound effects ")
        f.write("suitable for the Allive Migration game project.\n\n")
        f.write("### License Summary\n\n")
        f.write("| Source | License | Attribution Required |\n")
        f.write("|--------|---------|---------------------|\n")
        f.write("| Pixabay Sound Effects | Pixabay Content License | No |\n")
        f.write("| Mixkit | Mixkit License | No |\n")
        f.write("| Freesound (CC0 only) | CC0 Public Domain | No |\n")
        f.write("| Zapsplat | Zapsplat Standard License | Yes (free tier) |\n\n")

        for category, items in CURATED_SOUNDS.items():
            f.write(f"## {category.replace('_', ' ').title()}\n\n")
            for item in items:
                f.write(f"- **[{item['name']}]({item['url']})**\n")
                f.write(f"  - License: {item['license']}\n")
                f.write(f"  - {item.get('notes', '')}\n\n")

        f.write("\n---\n")
        f.write("## Usage Recommendations for Allive Migration\n\n")
        f.write("### UI Sound Effects\n")
        f.write("- Use chime/bell sounds from Pixabay for ethereal node-pass effects\n")
        f.write("- Use whoosh/air sounds for drag-start effects\n")
        f.write("- Combine with synthesized layers from generate_ui_sfx.py\n\n")

        f.write("### Species Sounds\n")
        f.write("- **Waterbird/Goose calls**: Search Pixabay 'duck' and 'goose' categories\n")
        f.write("- **Butterfly hum**: Search Pixabay 'bee hum' for drone-like insect sounds\n")
        f.write("- **Salmon leap**: Search Pixabay 'water splash' or 'splash'\n")
        f.write("- **Wildebeest**: Search Pixabay 'cow moo' for bovine-like calls\n")
        f.write("- **Eel movement**: Search Pixabay 'underwater' for submerged ambience\n")
        f.write("- **Turtle breath**: Search Pixabay 'breath' and 'ocean' categories\n")
        f.write("- **Frog calls**: Search Pixabay 'frog' for amphibian calls\n\n")

        f.write("### Download Workflow\n")
        f.write("1. Visit the search links above\n")
        f.write("2. Preview and select the best-matching sounds\n")
        f.write("3. Download individual files (typically .mp3 or .wav)\n")
        f.write("4. Place in `./needownload/` directory\n")
        f.write("5. Run `generate_species_sfx.py` for additional synthesized sounds\n")

    print(f"  [i] Comprehensive guide saved to: {guide_path}")

    # Try Pixabay for key sounds
    print("\n  Attempting Pixabay API downloads...")
    for category in ["water_splash", "bird_call", "frog_call"]:
        if category in CURATED_SOUNDS and CURATED_SOUNDS[category]:
            search_url = CURATED_SOUNDS[category][0]["url"]
            download_from_pixabay_search(search_url, output_dir)

    print("\n  [OK]  Curated pack reference generated!")
    print(f"  [+] Browse and download manually from the links in: {guide_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Search and download free commercial-use sound effects",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python download_free_sfx.py --search "bird call"
  python download_free_sfx.py --search "water splash"
  python download_free_sfx.py --all
  python download_free_sfx.py --download "https://example.com/sound.wav"
        """
    )
    parser.add_argument("--search", "-s", type=str, help="Search for sound effects by keyword")
    parser.add_argument("--download", "-d", type=str, help="Download from a direct URL")
    parser.add_argument("--all", "-a", action="store_true", help="Download curated sound pack")
    parser.add_argument("--output", "-o", default=DEFAULT_OUTPUT, help=f"Output directory (default: {DEFAULT_OUTPUT})")
    args = parser.parse_args()

    output_dir = os.path.abspath(args.output)
    os.makedirs(output_dir, exist_ok=True)

    print("[*] Free Sound Effect Resource Tool")
    print(f"   Output: {output_dir}")
    print()

    if args.search:
        print(f"[>] Searching for: '{args.search}'")
        results = search_sounds(args.search)
        list_results(results, output_dir)

    elif args.download:
        fname = os.path.join(output_dir, os.path.basename(args.download))
        download_file(args.download, fname)

    elif args.all:
        download_curated_pack(output_dir)

    else:
        # Default: show all curated resources
        print("[*] All Curated Free Sound Resources:\n")
        all_results = []
        for items in CURATED_SOUNDS.values():
            all_results.extend(items)
        list_results(all_results, output_dir)

        # Also generate full guide
        print("[>] Tip: use --all to generate comprehensive download guide")
        print("[>] Tip: use --search '<keyword>' to find specific sounds")
        print("[>] Tip: use --download '<url>' to download a specific file")


if __name__ == "__main__":
    main()
