# Project

- Project (root)
    - Responsibilities: engine, box-graph, editing, sample-manager, recording, etc.

- ProjectProfile (includes metadata and cover)
    - Project
    - ProjectMeta
        - name, description, tags, created, modified, notepad
    - Cover (optional)

- ProjectStorage (OPFS)
    - list/store/load/delete projects
    - list used samples

- SampleStorage
  - list/store/load/delete samples
  - per-sample files in OPFS

- ProjectBundle (bundles metadata and samples)
    - encode/decode bundled projects

- CloudBackup
    - sync projects and samples with the cloud
    - Uses:
        - ProjectStorage
        - SampleStorage
        - CloudStorageHandler (upload/download/list/delete)