// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "RalphyMedia",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "RalphyMediaCore", targets: ["RalphyMediaCore"]),
        .executable(name: "RalphyMedia", targets: ["RalphyMediaApp"]),
    ],
    targets: [
        .target(name: "RalphyMediaCore"),
        .executableTarget(
            name: "RalphyMediaApp",
            dependencies: ["RalphyMediaCore"]
        ),
        .testTarget(
            name: "RalphyMediaCoreTests",
            dependencies: ["RalphyMediaCore"]
        ),
    ]
)
