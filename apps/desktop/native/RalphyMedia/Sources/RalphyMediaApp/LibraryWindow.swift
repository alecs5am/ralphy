import AVKit
import SwiftUI
import RalphyMediaCore

struct LibraryWindow: View {
    @StateObject private var viewModel = LibraryViewModel()

    var body: some View {
        NavigationSplitView {
            Sidebar(viewModel: viewModel)
                .navigationSplitViewColumnWidth(min: 190, ideal: 220, max: 280)
        } content: {
            MediaGrid(viewModel: viewModel)
                .navigationSplitViewColumnWidth(min: 520, ideal: 900)
        } detail: {
            Inspector(viewModel: viewModel)
                .navigationSplitViewColumnWidth(min: 280, ideal: 340, max: 420)
        }
        .toolbar {
            ToolbarItemGroup {
                Button("Open .ralphy") { viewModel.pickLibrary() }
                TextField("Search", text: $viewModel.searchText)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 240)
                Picker("Type", selection: $viewModel.selectedBucket) {
                    Text("All").tag(MediaBucket?.none)
                    ForEach(MediaBucket.allCases.filter { $0 != .other }, id: \.self) { bucket in
                        Text(bucket.rawValue.capitalized).tag(Optional(bucket))
                    }
                }
                .frame(width: 120)
                Toggle("Favorites", isOn: $viewModel.favoriteOnly)
                Toggle("Rejected", isOn: $viewModel.showRejected)
                Slider(value: $viewModel.gridSize, in: 120...320)
                    .frame(width: 140)
            }
        }
        .alert("Ralphy Media", isPresented: Binding(
            get: { viewModel.errorMessage != nil },
            set: { if !$0 { viewModel.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
        .onAppear { viewModel.restoreLastLibrary() }
    }
}

private struct Sidebar: View {
    @ObservedObject var viewModel: LibraryViewModel

    var body: some View {
        List {
            Section("Library") {
                Button {
                    viewModel.selectedWorkspace = nil
                    viewModel.selectedProject = nil
                } label: {
                    Label("All", systemImage: "tray.full")
                    Spacer()
                    Text("\(viewModel.items.count)").foregroundStyle(.secondary)
                }
                Button {
                    viewModel.showRejected = false
                } label: {
                    Label("Usable", systemImage: "checkmark.circle")
                }
                Button {
                    viewModel.favoriteOnly.toggle()
                } label: {
                    Label("Favorites", systemImage: "star")
                }
            }

            Section("Workspaces") {
                ForEach(viewModel.workspaces, id: \.0) { workspace, count in
                    Button {
                        viewModel.selectedWorkspace = workspace
                        viewModel.selectedProject = nil
                    } label: {
                        HStack {
                            Text(workspace)
                            Spacer()
                            Text("\(count)").foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section("Projects") {
                ForEach(viewModel.projects, id: \.0) { project, count in
                    Button {
                        viewModel.selectedProject = project
                    } label: {
                        HStack {
                            Text(project)
                                .lineLimit(1)
                            Spacer()
                            Text("\(count)").foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if let root = viewModel.rootURL {
                Text(root.path)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .padding(8)
            }
        }
    }
}

private struct MediaGrid: View {
    @ObservedObject var viewModel: LibraryViewModel

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: viewModel.gridSize), spacing: 12)], spacing: 16) {
                ForEach(viewModel.filteredItems) { item in
                    MediaTile(
                        item: item,
                        annotation: viewModel.annotation(for: item),
                        selected: viewModel.selectedIDs.contains(item.id)
                    )
                    .frame(height: viewModel.gridSize * 0.78)
                    .onTapGesture {
                        viewModel.select(item, additive: NSEvent.modifierFlags.contains(.command))
                    }
                    .contextMenu {
                        Button("Favorite") {
                            viewModel.updateAnnotation(for: item) { $0.favorite.toggle() }
                        }
                        Button("Reject as Slop") {
                            viewModel.updateAnnotation(for: item) { $0.rejected = true }
                        }
                        Button("Copy for Agent") {
                            viewModel.select(item, additive: false)
                            viewModel.copyForAgent()
                        }
                        Divider()
                        Button("Reveal in Finder") {
                            viewModel.select(item, additive: false)
                            viewModel.revealSelectionInFinder()
                        }
                        Button("Move to Trash", role: .destructive) {
                            viewModel.select(item, additive: false)
                            viewModel.moveSelectionToTrash()
                        }
                    }
                }
            }
            .padding(14)
        }
        .overlay {
            if viewModel.rootURL == nil {
                ContentUnavailableView("Open a .ralphy folder", systemImage: "folder", description: Text("Choose the hidden Ralphy state directory from the core checkout."))
            } else if viewModel.filteredItems.isEmpty {
                ContentUnavailableView("No matching files", systemImage: "line.3.horizontal.decrease.circle")
            }
        }
    }
}

private struct MediaTile: View {
    let item: MediaItem
    let annotation: MediaAnnotation
    let selected: Bool

    var body: some View {
        VStack(spacing: 6) {
            ZStack(alignment: .topLeading) {
                Thumbnail(item: item)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                Text(item.fileExtension.uppercased())
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(.black.opacity(0.55))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 3))
                    .padding(5)
                HStack(spacing: 4) {
                    if annotation.favorite { Image(systemName: "star.fill").foregroundStyle(.yellow) }
                    if annotation.rejected { Image(systemName: "xmark.octagon.fill").foregroundStyle(.red) }
                }
                .padding(6)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            }
            Text(item.filename)
                .font(.caption)
                .lineLimit(1)
            Text("\(item.workspace) / \(item.project)")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(6)
        .background(selected ? Color.accentColor.opacity(0.24) : Color.clear)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(selected ? Color.accentColor : Color.gray.opacity(0.18), lineWidth: selected ? 2 : 1)
        )
    }
}

private struct Thumbnail: View {
    let item: MediaItem

    var body: some View {
        Rectangle()
            .fill(Color(nsColor: .controlBackgroundColor))
            .overlay {
                switch item.bucket {
                case .image:
                    if let image = NSImage(contentsOf: item.url) {
                        Image(nsImage: image)
                            .resizable()
                            .scaledToFill()
                    } else {
                        Image(systemName: "photo")
                    }
                case .video:
                    Image(systemName: "play.rectangle.fill").font(.system(size: 34))
                case .audio:
                    Image(systemName: "waveform").font(.system(size: 34))
                case .text:
                    Image(systemName: "doc.text").font(.system(size: 34))
                case .other:
                    Image(systemName: "doc").font(.system(size: 34))
                }
            }
            .clipped()
    }
}

private struct Inspector: View {
    @ObservedObject var viewModel: LibraryViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let item = viewModel.primarySelection {
                Preview(item: item)
                    .frame(height: 190)
                Text(item.filename)
                    .font(.headline)
                    .textSelection(.enabled)
                Text(item.relativePath)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)

                Divider()
                AnnotationEditor(viewModel: viewModel, item: item)
                Divider()
                Properties(item: item)
                Divider()
                HStack {
                    Button("Open") { viewModel.openSelection() }
                    Button("Reveal") { viewModel.revealSelectionInFinder() }
                    Button("Copy for Agent") { viewModel.copyForAgent() }
                }
                Button("Move to Trash", role: .destructive) {
                    viewModel.moveSelectionToTrash()
                }
            } else {
                ContentUnavailableView("No selection", systemImage: "sidebar.right")
            }
            Spacer()
        }
        .padding(14)
    }
}

private struct Preview: View {
    let item: MediaItem

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8).fill(Color(nsColor: .controlBackgroundColor))
            switch item.bucket {
            case .image:
                if let image = NSImage(contentsOf: item.url) {
                    Image(nsImage: image).resizable().scaledToFit()
                }
            case .video, .audio:
                VideoPlayer(player: AVPlayer(url: item.url))
            case .text:
                ScrollView {
                    Text((try? String(contentsOf: item.url, encoding: .utf8)).map { String($0.prefix(4_000)) } ?? "")
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            case .other:
                Image(systemName: "doc")
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

private struct AnnotationEditor: View {
    @ObservedObject var viewModel: LibraryViewModel
    let item: MediaItem

    var annotation: MediaAnnotation {
        viewModel.annotation(for: item)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                ForEach(1...5, id: \.self) { value in
                    Button {
                        viewModel.updateAnnotation(for: item) { $0.rating = value }
                    } label: {
                        Image(systemName: annotation.rating >= value ? "star.fill" : "star")
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
                Toggle("Favorite", isOn: Binding(
                    get: { annotation.favorite },
                    set: { newValue in viewModel.updateAnnotation(for: item) { $0.favorite = newValue } }
                ))
                Toggle("Rejected", isOn: Binding(
                    get: { annotation.rejected },
                    set: { newValue in viewModel.updateAnnotation(for: item) { $0.rejected = newValue } }
                ))
            }

            TextField("Tags, comma separated", text: Binding(
                get: { annotation.tags.joined(separator: ", ") },
                set: { text in
                    viewModel.updateAnnotation(for: item) {
                        $0.tags = text.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
                    }
                }
            ))

            TextField("Notes", text: Binding(
                get: { annotation.note },
                set: { text in viewModel.updateAnnotation(for: item) { $0.note = text } }
            ), axis: .vertical)
            .lineLimit(3...6)
        }
    }
}

private struct Properties: View {
    let item: MediaItem

    var body: some View {
        Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 6) {
            row("Workspace", item.workspace)
            row("Project", item.project)
            row("Type", item.bucket.rawValue)
            row("Size", ByteCountFormatter.string(fromByteCount: item.sizeBytes, countStyle: .file))
            if let date = item.modifiedAt {
                row("Modified", date.formatted(date: .abbreviated, time: .shortened))
            }
        }
        .font(.caption)
    }

    private func row(_ key: String, _ value: String) -> some View {
        GridRow {
            Text(key).foregroundStyle(.secondary)
            Text(value).textSelection(.enabled)
        }
    }
}
