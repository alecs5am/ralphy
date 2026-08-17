import AppKit
import Foundation
import RalphyMediaCore

@MainActor
final class LibraryViewModel: ObservableObject {
    @Published var rootURL: URL?
    @Published var items: [MediaItem] = []
    @Published var annotations: [String: MediaAnnotation] = [:]
    @Published var selectedIDs: Set<String> = []
    @Published var searchText = ""
    @Published var selectedWorkspace: String?
    @Published var selectedProject: String?
    @Published var selectedBucket: MediaBucket?
    @Published var showRejected = true
    @Published var favoriteOnly = false
    @Published var gridSize: Double = 180
    @Published var errorMessage: String?

    private var store: MetadataStore?
    private var watcher: FolderWatcher?
    private var reloadTask: Task<Void, Never>?

    var filteredItems: [MediaItem] {
        items.filter { item in
            if let selectedWorkspace, item.workspace != selectedWorkspace { return false }
            if let selectedProject, item.project != selectedProject { return false }
            if let selectedBucket, item.bucket != selectedBucket { return false }
            let annotation = annotations[item.relativePath] ?? MediaAnnotation()
            if !showRejected && annotation.rejected { return false }
            if favoriteOnly && !annotation.favorite { return false }
            if !searchText.isEmpty {
                let haystack = "\(item.filename) \(item.relativePath) \(annotation.tags.joined(separator: " ")) \(annotation.note)"
                    .localizedLowercase
                if !haystack.contains(searchText.localizedLowercase) { return false }
            }
            return true
        }
    }

    var selectedItems: [MediaItem] {
        items.filter { selectedIDs.contains($0.id) }
    }

    var primarySelection: MediaItem? {
        selectedItems.sorted { $0.relativePath < $1.relativePath }.first
    }

    var workspaces: [(String, Int)] {
        counted(items.map(\.workspace))
    }

    var projects: [(String, Int)] {
        let visible = selectedWorkspace.map { workspace in items.filter { $0.workspace == workspace } } ?? items
        return counted(visible.map(\.project))
    }

    func restoreLastLibrary() {
        guard let path = UserDefaults.standard.string(forKey: "lastRalphyRoot") else { return }
        load(root: URL(filePath: path))
    }

    func pickLibrary() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Open .ralphy"
        if panel.runModal() == .OK, let url = panel.url {
            load(root: url)
        }
    }

    func load(root: URL) {
        do {
            let scanned = try MediaScanner().scan(root: root)
            let metadata = try MetadataStore(root: root)
            rootURL = root.standardizedFileURL
            items = scanned
            annotations = metadata.annotations
            store = metadata
            selectedIDs = selectedIDs.intersection(Set(scanned.map(\.id)))
            UserDefaults.standard.set(root.standardizedFileURL.path, forKey: "lastRalphyRoot")
            startWatching(root: root.standardizedFileURL)
        } catch {
            errorMessage = String(describing: error)
        }
    }

    func select(_ item: MediaItem, additive: Bool) {
        if additive {
            if selectedIDs.contains(item.id) {
                selectedIDs.remove(item.id)
            } else {
                selectedIDs.insert(item.id)
            }
        } else {
            selectedIDs = [item.id]
        }
    }

    func annotation(for item: MediaItem) -> MediaAnnotation {
        annotations[item.relativePath] ?? MediaAnnotation()
    }

    func updateAnnotation(for item: MediaItem, _ edit: (inout MediaAnnotation) -> Void) {
        var annotation = annotation(for: item)
        edit(&annotation)
        annotation.updatedAt = Date()
        annotations[item.relativePath] = annotation
        saveAnnotations()
    }

    func moveSelectionToTrash() {
        for item in selectedItems {
            do {
                var result: NSURL?
                try FileManager.default.trashItem(at: item.url, resultingItemURL: &result)
                selectedIDs.remove(item.id)
            } catch {
                errorMessage = "Could not move \(item.filename) to Trash: \(error.localizedDescription)"
            }
        }
        reloadSoon()
    }

    func revealSelectionInFinder() {
        guard let item = primarySelection else { return }
        NSWorkspace.shared.activateFileViewerSelecting([item.url])
    }

    func openSelection() {
        guard let item = primarySelection else { return }
        NSWorkspace.shared.open(item.url)
    }

    func copyForAgent() {
        let selected = selectedItems.isEmpty ? Array(filteredItems.prefix(1)) : selectedItems
        let text = AgentFeedback.render(items: selected, annotations: annotations)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
    }

    private func saveAnnotations() {
        guard var store else { return }
        store.annotations = annotations
        do {
            try store.save()
            self.store = store
        } catch {
            errorMessage = "Could not save annotations: \(error.localizedDescription)"
        }
    }

    private func startWatching(root: URL) {
        watcher?.stop()
        watcher = FolderWatcher(url: root) { [weak self] in
            Task { @MainActor in self?.reloadSoon() }
        }
        watcher?.start()
    }

    private func reloadSoon() {
        reloadTask?.cancel()
        reloadTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 450_000_000)
            await MainActor.run {
                guard let self, let rootURL = self.rootURL else { return }
                self.load(root: rootURL)
            }
        }
    }

    private func counted(_ values: [String]) -> [(String, Int)] {
        Dictionary(grouping: values, by: { $0 })
            .map { ($0.key, $0.value.count) }
            .sorted { $0.0.localizedStandardCompare($1.0) == .orderedAscending }
    }
}
