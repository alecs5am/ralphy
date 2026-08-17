import Foundation

public enum MediaScannerError: Error, Equatable {
    case notRalphyRoot
}

public struct MediaScanner: Sendable {
    private let imageExtensions = Set(["png", "jpg", "jpeg", "gif", "webp", "heic", "tiff"])
    private let videoExtensions = Set(["mp4", "mov", "m4v", "webm"])
    private let audioExtensions = Set(["mp3", "wav", "m4a", "aac", "aiff", "flac"])
    private let textExtensions = Set(["txt", "md", "json", "jsonl", "srt", "html", "css", "js", "ts"])

    public init() {}

    public func scan(root: URL) throws -> [MediaItem] {
        let root = root.standardizedFileURL
        guard root.lastPathComponent == ".ralphy",
              FileManager.default.fileExists(atPath: root.appending(path: "workspaces").path) else {
            throw MediaScannerError.notRalphyRoot
        }

        let keys: Set<URLResourceKey> = [.isRegularFileKey, .fileSizeKey, .creationDateKey, .contentModificationDateKey]
        guard let enumerator = FileManager.default.enumerator(
            at: root.appending(path: "workspaces"),
            includingPropertiesForKeys: Array(keys),
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else {
            return []
        }

        var items: [MediaItem] = []
        for case let fileURL as URL in enumerator {
            let values = try fileURL.resourceValues(forKeys: keys)
            guard values.isRegularFile == true else { continue }

            let relativePath = fileURL.relativePath(from: root)
            let parts = relativePath.split(separator: "/").map(String.init)
            guard parts.count >= 5,
                  parts[0] == "workspaces",
                  parts[2] == "projects" else {
                continue
            }

            let ext = fileURL.pathExtension.lowercased()
            guard let bucket = bucket(for: ext), bucket != .other else { continue }

            items.append(MediaItem(
                id: relativePath,
                url: fileURL,
                relativePath: relativePath,
                workspace: parts[1],
                project: parts[3],
                bucket: bucket,
                filename: fileURL.lastPathComponent,
                fileExtension: ext,
                sizeBytes: Int64(values.fileSize ?? 0),
                createdAt: values.creationDate,
                modifiedAt: values.contentModificationDate
            ))
        }

        return items.sorted { $0.relativePath < $1.relativePath }
    }

    private func bucket(for fileExtension: String) -> MediaBucket? {
        if imageExtensions.contains(fileExtension) { return .image }
        if videoExtensions.contains(fileExtension) { return .video }
        if audioExtensions.contains(fileExtension) { return .audio }
        if textExtensions.contains(fileExtension) { return .text }
        return nil
    }
}

private extension URL {
    func relativePath(from root: URL) -> String {
        let rootPath = root.standardizedFileURL.path
        let path = standardizedFileURL.path
        guard path.hasPrefix(rootPath + "/") else { return lastPathComponent }
        return String(path.dropFirst(rootPath.count + 1))
    }
}
