"""Focused checks for the optional OKF v0.2 authored guidance."""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / "templates" / "common" / "skills"


class OkfProvenanceGuidanceTests(unittest.TestCase):
    def read_skill(self, name: str) -> str:
        return (SKILLS / name / "SKILL.md").read_text(encoding="utf-8")

    def test_guidance_covers_each_authored_surface(self) -> None:
        for skill in ("omp-flow-wiki", "omp-flow-implement", "omp-flow-check", "omp-flow-sleep"):
            text = self.read_skill(skill)
            self.assertIn("OKF v0.2", text, skill)
            for field in ("sources", "generated", "verified", "status", "stale_after"):
                self.assertIn(field, text, f"{skill} is missing {field}")
            self.assertRegex(text, r"(?i)optional")

    def test_guidance_preserves_human_and_runtime_boundaries(self) -> None:
        combined = "\n".join(
            self.read_skill(skill)
            for skill in ("omp-flow-wiki", "omp-flow-implement", "omp-flow-check", "omp-flow-sleep")
        )
        self.assertRegex(combined, r"(?i)not (a )?(runtime )?approval")
        self.assertRegex(combined, r"(?i)omit unknown|unknown .*omit")
        self.assertRegex(combined, r"(?i)human-readable|human readable")


if __name__ == "__main__":
    unittest.main()
