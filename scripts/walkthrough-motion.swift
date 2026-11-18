// Offline video rendering only. All UI input and captures are done through CUA.
import AppKit
import Foundation

struct Step: Decodable { let image: String; let duration: Double; let cursor: [Double]?; let click: Bool }
struct Scene: Decodable { let title: String; let role: String; let caption: String; let duration: Double; let steps: [Step] }
struct Plan: Decodable { let output: String; let ffmpeg: String; let width: Double; let height: Double; let fps: Int; let scenes: [Scene] }
guard CommandLine.arguments.count == 2 else { fatalError("Pass the render plan JSON.") }
let plan = try JSONDecoder().decode(Plan.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
let w = 720, h = 1280
guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: w*4, bitsPerPixel: 32), let graphics = NSGraphicsContext(bitmapImageRep: bitmap), let pixels = bitmap.bitmapData else { fatalError("Cannot create frame surface.") }
let pipe = Pipe(), encoder = Process()
encoder.executableURL = URL(fileURLWithPath: plan.ffmpeg)
encoder.arguments = ["-hide_banner","-loglevel","error","-y","-f","rawvideo","-pixel_format","rgba","-video_size","720x1280","-framerate",String(plan.fps),"-i","pipe:0","-an","-c:v","libx264","-preset","fast","-crf","21","-profile:v","main","-level:v","3.1","-pix_fmt","yuv420p","-movflags","+faststart",plan.output]
encoder.standardInput = pipe
try encoder.run()
let cream = NSColor(calibratedRed: 1, green: 0.975, blue: 0.961, alpha: 1)
let plum = NSColor(calibratedRed: 0.20, green: 0.15, blue: 0.19, alpha: 1)
let rose = NSColor(calibratedRed: 0.66, green: 0.28, blue: 0.38, alpha: 1)
let muted = NSColor(calibratedRed: 0.55, green: 0.46, blue: 0.50, alpha: 1)
func ease(_ n: Double) -> Double { let t=max(0,min(1,n)); return t*t*(3-2*t) }
func text(_ value: String, _ size: CGFloat, _ color: NSColor, _ rect: NSRect, bold: Bool = false) {
  let p = NSMutableParagraphStyle(); p.lineBreakMode = .byWordWrapping; p.lineSpacing = 4
  NSAttributedString(string: value, attributes: [.font: bold ? NSFont.boldSystemFont(ofSize:size) : NSFont.systemFont(ofSize:size), .foregroundColor:color, .paragraphStyle:p]).draw(in:rect)
}
func drawScreen(_ img: NSImage, alpha: CGFloat = 1) {
  img.draw(in: screenRect, from:.zero, operation:.sourceOver, fraction:alpha)
}
func point(_ a: [Double]) -> NSPoint { return NSPoint(x:screenRect.minX+a[0]*scale, y:screenRect.maxY-a[1]*scale) }
func cursor(_ p: NSPoint, pulse: Double?) {
  if let phase=pulse, phase >= 0 && phase <= 1 {
    let r=13+31*phase; rose.withAlphaComponent(0.55*(1-phase)).setStroke()
    let ring=NSBezierPath(ovalIn:NSRect(x:p.x-r,y:p.y-r,width:r*2,height:r*2));ring.lineWidth=3;ring.stroke()
    rose.withAlphaComponent(0.14*(1-phase)).setFill();NSBezierPath(ovalIn:NSRect(x:p.x-15,y:p.y-15,width:30,height:30)).fill()
  }
  let arrow=NSBezierPath();arrow.move(to:p)
  for d in [[0.0,-31.0],[7.0,-23.0],[13.0,-37.0],[18.0,-34.0],[11.0,-21.0],[24.0,-21.0]] {arrow.line(to:NSPoint(x:p.x+d[0],y:p.y+d[1]))};arrow.close()
  NSGraphicsContext.saveGraphicsState();let shadow=NSShadow();shadow.shadowColor=NSColor.black.withAlphaComponent(0.20);shadow.shadowBlurRadius=4;shadow.shadowOffset=NSSize(width:1,height:-2);shadow.set()
  NSColor.white.setFill();arrow.fill();plum.setStroke();arrow.lineWidth=1.7;arrow.lineJoinStyle = .round;arrow.stroke();NSGraphicsContext.restoreGraphicsState()
}
let scale=min(672/plan.width,1032/plan.height)
let screenRect=NSRect(x:(720-plan.width*scale)/2,y:176+(1032-plan.height*scale)/2,width:plan.width*scale,height:plan.height*scale)
let total=plan.scenes.reduce(0){$0+$1.duration}
var elapsed=0.0, previousImage: NSImage?=nil
for (index,scene) in plan.scenes.enumerated() {
  let images=scene.steps.map{step -> NSImage in guard let img=NSImage(contentsOfFile:step.image) else {fatalError("Missing capture: "+step.image)};return img}
  var starts=[Double](), startsAt=0.0, targets=[[Double]](), last=[450.0,730.0]
  for step in scene.steps {starts.append(startsAt);startsAt+=step.duration;if let c=step.cursor {last=c};targets.append(last)}
  let count=Int((scene.duration*Double(plan.fps)).rounded())
  for frame in 0..<count {
    try autoreleasepool {
      let t=Double(frame)/Double(plan.fps), i=starts.lastIndex(where:{$0<=t}) ?? 0, step=scene.steps[i], local=t-starts[i]
      NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=graphics
      cream.setFill();NSRect(x:0,y:0,width:w,height:h).fill()
      text("malapit",28,plum,NSRect(x:38,y:1226,width:190,height:37),bold:true)
      text("QUICK TOUR",12,muted,NSRect(x:166,y:1230,width:200,height:19),bold:true)
      let roleWidth:CGFloat=max(80,CGFloat(scene.role.count)*9+30)
      rose.withAlphaComponent(0.10).setFill();NSBezierPath(roundedRect:NSRect(x:682-roleWidth,y:1224,width:roleWidth,height:34),xRadius:17,yRadius:17).fill()
      text(scene.role,15,rose,NSRect(x:698-roleWidth,y:1230,width:roleWidth-25,height:23),bold:true)
      NSGraphicsContext.saveGraphicsState();NSBezierPath(roundedRect:screenRect,xRadius:18,yRadius:18).addClip()
      let blend = step.duration < 0.65 ? 1.0 : ease(local/0.16)
      if i>0 && blend<1 {drawScreen(images[i-1]);drawScreen(images[i],alpha:blend)}
      else if i==0 && t<0.24, let previous=previousImage {drawScreen(previous);drawScreen(images[i],alpha:ease(t/0.24))}
      else {drawScreen(images[i])}
      NSGraphicsContext.restoreGraphicsState()
      let from=i>0 ? targets[i-1] : [450.0,730.0], to=targets[i]
      let move=ease(local/min(0.65,max(0.12,step.duration*0.55)))
      let here=point([from[0]+(to[0]-from[0])*move,from[1]+(to[1]-from[1])*move])
      let clickAt=max(0.25,step.duration-0.40)
      cursor(here,pulse:step.click ? (local-clickAt)/0.38 : nil)
      text(String(format:"%02d",index+1)+"  /  "+String(format:"%02d",plan.scenes.count)+"   "+scene.title,17,rose,NSRect(x:34,y:137,width:652,height:29),bold:true)
      text(scene.caption,25,plum,NSRect(x:34,y:43,width:652,height:89))
      text("FICTIONAL DATA  ·  NO REAL MONEY MOVED",12,muted,NSRect(x:34,y:15,width:652,height:22),bold:true)
      rose.withAlphaComponent(0.12).setFill();NSRect(x:0,y:0,width:w,height:4).fill();rose.setFill();NSRect(x:0,y:0,width:720*(elapsed+t)/total,height:4).fill()
      NSGraphicsContext.restoreGraphicsState()
      try pipe.fileHandleForWriting.write(contentsOf:Data(bytesNoCopy:pixels,count:w*h*4,deallocator:.none))
    }
  }
  elapsed+=scene.duration;previousImage=images.last;print("Animated chapter \(index+1)/\(plan.scenes.count): \(scene.title)");fflush(stdout)
}
try pipe.fileHandleForWriting.close();encoder.waitUntilExit()
guard encoder.terminationStatus==0 else {fatalError("Video encoder failed.")}
