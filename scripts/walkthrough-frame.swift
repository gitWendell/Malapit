// Offline video-frame composition. Browser screens are captured separately with CUA.
import AppKit
import Foundation

struct Frame: Decodable { let image: String; let output: String; let title: String; let caption: String; let index: Int; let total: Int }
let args = CommandLine.arguments
guard args.count == 2 else { fatalError("Pass one frame-description JSON file.") }
let frame = try JSONDecoder().decode(Frame.self, from: Data(contentsOf: URL(fileURLWithPath: args[1])))
guard let screen = NSImage(contentsOfFile: frame.image), let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 720, pixelsHigh: 1280, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0), let graphics = NSGraphicsContext(bitmapImageRep: bitmap) else { fatalError("Cannot create the video frame.") }
NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = graphics
let background = NSColor(calibratedRed: 1, green: 0.975, blue: 0.958, alpha: 1)
let ink = NSColor(calibratedRed: 0.19, green: 0.15, blue: 0.18, alpha: 1)
let rose = NSColor(calibratedRed: 0.66, green: 0.28, blue: 0.38, alpha: 1)
background.setFill(); NSRect(x: 0, y: 0, width: 720, height: 1280).fill()
let scale = min(720 / screen.size.width, 1100 / screen.size.height)
let size = NSSize(width: screen.size.width * scale, height: screen.size.height * scale)
screen.draw(in: NSRect(x: (720-size.width)/2, y: 180+(1100-size.height)/2, width: size.width, height: size.height), from: .zero, operation: .sourceOver, fraction: 1)
background.setFill(); NSRect(x: 0, y: 0, width: 720, height: 180).fill()
func text(_ value: String, font: CGFloat, color: NSColor, rect: NSRect, bold: Bool = false) {
  let paragraph = NSMutableParagraphStyle(); paragraph.lineBreakMode = .byWordWrapping; paragraph.lineSpacing = 4
  let face = bold ? NSFont.boldSystemFont(ofSize: font) : NSFont.systemFont(ofSize: font)
  NSAttributedString(string: value, attributes: [.font: face, .foregroundColor: color, .paragraphStyle: paragraph]).draw(in: rect)
}
text(String(format: "%02d / %02d", frame.index, frame.total) + "  ·  " + frame.title, font: 17, color: rose, rect: NSRect(x: 30, y: 144, width: 660, height: 25), bold: true)
text(frame.caption, font: 25, color: ink, rect: NSRect(x: 30, y: 43, width: 660, height: 94))
text("DEMO DATA · NO MONEY TRANSFERRED", font: 14, color: rose, rect: NSRect(x: 30, y: 12, width: 660, height: 21), bold: true)
NSGraphicsContext.restoreGraphicsState()
guard let png = bitmap.representation(using: .png, properties: [:]) else { fatalError("Cannot encode frame.") }
try png.write(to: URL(fileURLWithPath: frame.output))
