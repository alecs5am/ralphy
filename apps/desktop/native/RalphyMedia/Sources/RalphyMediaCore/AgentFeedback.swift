import Foundation

public enum AgentFeedback {
    public static func render(items: [MediaItem], annotations: [String: MediaAnnotation]) -> String {
        var lines = ["## Copy for Agent", ""]

        for item in items.sorted(by: { $0.relativePath < $1.relativePath }) {
            let annotation = annotations[item.relativePath] ?? MediaAnnotation()
            lines.append("- `\(item.relativePath)`")
            lines.append("  workspace/project: \(item.workspace) / \(item.project)")
            lines.append("  type: \(item.bucket.rawValue)")
            lines.append("  rating: \(annotation.rating)/5")
            lines.append("  favorite: \(annotation.favorite ? "yes" : "no")")
            lines.append("  rejected: \(annotation.rejected ? "yes" : "no")")
            if !annotation.tags.isEmpty {
                lines.append("  tags: \(annotation.tags.joined(separator: ", "))")
            }
            if !annotation.note.isEmpty {
                lines.append("  note: \(annotation.note)")
            }
        }

        return lines.joined(separator: "\n")
    }
}
