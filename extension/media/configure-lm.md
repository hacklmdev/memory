## Language model for memory operations

HackLM Memory uses a Copilot model for two background tasks:

- **Redundancy check** — before storing, asks the model if the new entry is already covered
- **Gap analysis** — every few stores, asks the model what decisions are implied but not yet captured

The default model is `gpt-5-mini`. To change it, open the **Control Panel → Configure → Language Model** and pick any family available to your Copilot subscription.

This step completes when you save a new value for the `hacklm-memory.lmFamily` setting. If the default works for you, you can skip it.
