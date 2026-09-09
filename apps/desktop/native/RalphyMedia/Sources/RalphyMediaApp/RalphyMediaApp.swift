import Foundation
import RalphyMediaCore
import SwiftUI

@main
struct RalphyMediaApp: App {
    init() {
        if let flagIndex = CommandLine.arguments.firstIndex(of: "--scan-only"),
           CommandLine.arguments.indices.contains(flagIndex + 1) {
            let root = URL(filePath: CommandLine.arguments[flagIndex + 1])
            do {
                let items = try MediaScanner().scan(root: root)
                print("Indexed \(items.count) files in \(root.path)")
                Foundation.exit(0)
            } catch {
                fputs("Scan failed: \(error)\n", stderr)
                Foundation.exit(1)
            }
        }

        if CommandLine.arguments.count == 2, !CommandLine.arguments[1].hasPrefix("-") {
            UserDefaults.standard.set(URL(filePath: CommandLine.arguments[1]).standardizedFileURL.path, forKey: "lastRalphyRoot")
        }
    }

    var body: some Scene {
        WindowGroup("Ralphy Media") {
            LibraryWindow()
                .frame(minWidth: 1100, minHeight: 720)
        }
        .windowStyle(.titleBar)
    }
}
