import { forwardRef } from "react";
import { HugeiconsIcon, type HugeiconsIconProps } from "@hugeicons/react";
import {
  Activity01Icon, AlertCircleIcon, Alert01Icon, ArchiveIcon,
  ArrowDownRight01Icon, ArrowDownToLineIcon, ArrowUpDownIcon, ArrowLeft02Icon,
  ArrowRight02Icon, ArrowUp02Icon, ArrowUpRight01Icon, AudioLinesIcon,
  BatteryFullIcon, Notification01Icon, BlocksIcon, Bookmark01Icon,
  BotIcon, PackageIcon, Package01Icon, BracesIcon,
  BrainIcon, Building02Icon, UsbIcon, Calendar01Icon,
  TimeScheduleIcon, Calendar02Icon, Camera01Icon, CaptionsIcon,
  ChartNoAxesCombinedIcon, Tick01Icon, TickDouble01Icon, CheckmarkCircle01Icon,
  ArrowDown01Icon, ArrowLeft01Icon, ArrowRight01Icon, CircleDollarSignIcon,
  CircleSlashIcon, ClapperboardIcon, Clock03Icon, SourceCodeIcon,
  LayoutTwoColumnIcon, LayoutThreeColumnIcon, CompassIcon, ContrastIcon,
  Copy01Icon, CpuIcon, Dollar01Icon, Download01Icon,
  ArrowExpand01Icon, LinkSquare02Icon, ViewIcon, ViewOffIcon,
  Forward01Icon, FileClockIcon, FilePenIcon, FilePenLineIcon,
  FileBracesIcon, Txt01Icon,
  Facebook01Icon, File02Icon, Film01Icon, Folder01Icon, FolderHeartIcon,
  FolderInputIcon, FolderKanbanIcon, FolderOpenIcon, ArtboardIcon,
  GalleryHorizontalEndIcon, GaugeIcon, GitBranchIcon, GitCommitIcon,
  GitCompareIcon, GitForkIcon, GitMergeIcon, GlobeIcon,
  Grid2X2Icon, Drag01Icon, HardDriveIcon, FavouriteIcon,
  WorkHistoryIcon, Home01Icon, Image01Icon, ImageNotFound01Icon,
  ImageAdd01Icon, Image02Icon, InboxIcon, InformationCircleIcon,
  InstagramIcon, Key02Icon, KeyboardIcon, Layers01Icon,
  DashboardSquare01Icon, LayoutGridIcon, Layout01Icon, LibraryIcon,
  BulbIcon, Linkedin02Icon, ListViewIcon, CheckListIcon,
  FilterIcon, Loading03Icon, Gps02Icon, LockIcon,
  LockKeyIcon, Login01Icon, MagnetIcon,
  BubbleChatIcon, Message01Icon, Message02Icon, Mic01Icon,
  ArrowShrink02Icon, MinusSignIcon, MoreHorizontalIcon, MoreVerticalIcon,
  MoveDiagonal01Icon, MusicNote02Icon, PackageDeliveredIcon, PaintBoardIcon,
  PanelLeftIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, PanelRightIcon,
  PanelRightCloseIcon, PanelRightOpenIcon, PanelsTopLeftIcon, PauseIcon,
  PenTool01Icon, PencilIcon, PencilEdit01Icon, ParagraphIcon,
  PinIcon, PinterestIcon, PlayIcon, Plug01Icon,
  Add01Icon, RadioIcon, Redo02Icon, RefreshIcon,
  RepeatIcon, Backward01Icon, RotateCcwIcon, RotateCwIcon,
  FloppyDiskIcon, ScanIcon, ScissorIcon, ScrollIcon,
  Search01Icon, SentIcon, Settings01Icon, Settings02Icon,
  Share02Icon, Shield01Icon, SecurityCheckIcon, ShuffleIcon,
  SignalIcon, PreviousIcon, NextIcon, SlidersHorizontalIcon,
  SparklesIcon, SplitIcon, SquareIcon, SquareDashedIcon,
  StickyNote01Icon, Store01Icon, ComputerTerminal01Icon, ThumbsDownIcon,
  ThumbsUpIcon, TiktokIcon, Delete02Icon, NewTwitterIcon,
  TextIcon, Undo02Icon, SquareUnlock01Icon, UnplugIcon,
  Upload01Icon, UserIcon, UserCircleIcon, UserGroupIcon,
  VolumeHighIcon, VolumeMute01Icon, MagicWand01Icon, WaveIcon,
  Wifi01Icon, WorkflowCircle01Icon, Wrench01Icon, Cancel01Icon,
  YoutubeIcon, ZoomInIcon, ZoomOutIcon,
} from "@hugeicons/core-free-icons";

export type AppIconProps = Omit<HugeiconsIconProps, "icon" | "altIcon" | "showAlt">;
export type AppIcon = ReturnType<typeof appIcon>;

/** App names keep icon choices consistent across pages and controls. */
function appIcon(name: string, icon: HugeiconsIconProps["icon"]) {
  const Icon = forwardRef<SVGSVGElement, AppIconProps>(({ className = "", ...props }, ref) => (
    <HugeiconsIcon ref={ref} icon={icon} strokeWidth={1.75} focusable="false"
      aria-hidden={props["aria-label"] || props["aria-labelledby"] ? undefined : true}
      className={("app-icon " + className).trim()} data-icon={name} {...props} />
  ));
  Icon.displayName = name;
  return Icon;
}

export const Activity = /* @__PURE__ */ appIcon("Activity", Activity01Icon);
export const AlertCircle = /* @__PURE__ */ appIcon("AlertCircle", AlertCircleIcon);
export const AlertTriangle = /* @__PURE__ */ appIcon("AlertTriangle", Alert01Icon);
export const Archive = /* @__PURE__ */ appIcon("Archive", ArchiveIcon);
export const ArrowDownRight = /* @__PURE__ */ appIcon("ArrowDownRight", ArrowDownRight01Icon);
export const ArrowDownToLine = /* @__PURE__ */ appIcon("ArrowDownToLine", ArrowDownToLineIcon);
export const ArrowDownUp = /* @__PURE__ */ appIcon("ArrowDownUp", ArrowUpDownIcon);
export const ArrowLeft = /* @__PURE__ */ appIcon("ArrowLeft", ArrowLeft02Icon);
export const ArrowRight = /* @__PURE__ */ appIcon("ArrowRight", ArrowRight02Icon);
export const ArrowUp = /* @__PURE__ */ appIcon("ArrowUp", ArrowUp02Icon);
export const ArrowUpRight = /* @__PURE__ */ appIcon("ArrowUpRight", ArrowUpRight01Icon);
export const AudioLines = /* @__PURE__ */ appIcon("AudioLines", AudioLinesIcon);
export const BatteryFull = /* @__PURE__ */ appIcon("BatteryFull", BatteryFullIcon);
export const Bell = /* @__PURE__ */ appIcon("Bell", Notification01Icon);
export const Blocks = /* @__PURE__ */ appIcon("Blocks", BlocksIcon);
export const Bookmark = /* @__PURE__ */ appIcon("Bookmark", Bookmark01Icon);
export const Bot = /* @__PURE__ */ appIcon("Bot", BotIcon);
export const Box = /* @__PURE__ */ appIcon("Box", PackageIcon);
export const Boxes = /* @__PURE__ */ appIcon("Boxes", Package01Icon);
export const Braces = /* @__PURE__ */ appIcon("Braces", BracesIcon);
export const Brain = /* @__PURE__ */ appIcon("Brain", BrainIcon);
export const Building2 = /* @__PURE__ */ appIcon("Building2", Building02Icon);
export const Cable = /* @__PURE__ */ appIcon("Cable", UsbIcon);
export const Calendar = /* @__PURE__ */ appIcon("Calendar", Calendar01Icon);
export const CalendarClock = /* @__PURE__ */ appIcon("CalendarClock", TimeScheduleIcon);
export const CalendarDays = /* @__PURE__ */ appIcon("CalendarDays", Calendar02Icon);
export const Camera = /* @__PURE__ */ appIcon("Camera", Camera01Icon);
export const Captions = /* @__PURE__ */ appIcon("Captions", CaptionsIcon);
export const ChartNoAxesCombined = /* @__PURE__ */ appIcon("ChartNoAxesCombined", ChartNoAxesCombinedIcon);
export const Check = /* @__PURE__ */ appIcon("Check", Tick01Icon);
export const CheckCheck = /* @__PURE__ */ appIcon("CheckCheck", TickDouble01Icon);
export const CheckCircle2 = /* @__PURE__ */ appIcon("CheckCircle2", CheckmarkCircle01Icon);
export const ChevronDown = /* @__PURE__ */ appIcon("ChevronDown", ArrowDown01Icon);
export const ChevronLeft = /* @__PURE__ */ appIcon("ChevronLeft", ArrowLeft01Icon);
export const ChevronRight = /* @__PURE__ */ appIcon("ChevronRight", ArrowRight01Icon);
export const CircleAlert = /* @__PURE__ */ appIcon("CircleAlert", AlertCircleIcon);
export const CircleCheck = /* @__PURE__ */ appIcon("CircleCheck", CheckmarkCircle01Icon);
export const CircleDollarSign = /* @__PURE__ */ appIcon("CircleDollarSign", CircleDollarSignIcon);
export const CircleSlash = /* @__PURE__ */ appIcon("CircleSlash", CircleSlashIcon);
export const Clapperboard = /* @__PURE__ */ appIcon("Clapperboard", ClapperboardIcon);
export const Clock3 = /* @__PURE__ */ appIcon("Clock3", Clock03Icon);
export const Code2 = /* @__PURE__ */ appIcon("Code2", SourceCodeIcon);
export const Columns2 = /* @__PURE__ */ appIcon("Columns2", LayoutTwoColumnIcon);
export const Columns3 = /* @__PURE__ */ appIcon("Columns3", LayoutThreeColumnIcon);
export const Compass = /* @__PURE__ */ appIcon("Compass", CompassIcon);
export const Contrast = /* @__PURE__ */ appIcon("Contrast", ContrastIcon);
export const Copy = /* @__PURE__ */ appIcon("Copy", Copy01Icon);
export const Cpu = /* @__PURE__ */ appIcon("Cpu", CpuIcon);
export const DollarSign = /* @__PURE__ */ appIcon("DollarSign", Dollar01Icon);
export const Download = /* @__PURE__ */ appIcon("Download", Download01Icon);
export const Expand = /* @__PURE__ */ appIcon("Expand", ArrowExpand01Icon);
export const ExternalLink = /* @__PURE__ */ appIcon("ExternalLink", LinkSquare02Icon);
export const Eye = /* @__PURE__ */ appIcon("Eye", ViewIcon);
export const EyeOff = /* @__PURE__ */ appIcon("EyeOff", ViewOffIcon);
export const FastForward = /* @__PURE__ */ appIcon("FastForward", Forward01Icon);
export const FileClock = /* @__PURE__ */ appIcon("FileClock", FileClockIcon);
export const FilePen = /* @__PURE__ */ appIcon("FilePen", FilePenIcon);
export const FilePenLine = /* @__PURE__ */ appIcon("FilePenLine", FilePenLineIcon);
export const Facebook = /* @__PURE__ */ appIcon("Facebook", Facebook01Icon);
export const FileText = /* @__PURE__ */ appIcon("FileText", File02Icon);
export const FileJson = /* @__PURE__ */ appIcon("FileJson", FileBracesIcon);
export const FileTxt = /* @__PURE__ */ appIcon("FileTxt", Txt01Icon);
export const Film = /* @__PURE__ */ appIcon("Film", Film01Icon);
export const Folder = /* @__PURE__ */ appIcon("Folder", Folder01Icon);
export const FolderHeart = /* @__PURE__ */ appIcon("FolderHeart", FolderHeartIcon);
export const FolderInput = /* @__PURE__ */ appIcon("FolderInput", FolderInputIcon);
export const FolderKanban = /* @__PURE__ */ appIcon("FolderKanban", FolderKanbanIcon);
export const FolderOpen = /* @__PURE__ */ appIcon("FolderOpen", FolderOpenIcon);
export const Frame = /* @__PURE__ */ appIcon("Frame", ArtboardIcon);
export const GalleryHorizontalEnd = /* @__PURE__ */ appIcon("GalleryHorizontalEnd", GalleryHorizontalEndIcon);
export const Gauge = /* @__PURE__ */ appIcon("Gauge", GaugeIcon);
export const GitBranch = /* @__PURE__ */ appIcon("GitBranch", GitBranchIcon);
export const GitCommitHorizontal = /* @__PURE__ */ appIcon("GitCommitHorizontal", GitCommitIcon);
export const GitCompareArrows = /* @__PURE__ */ appIcon("GitCompareArrows", GitCompareIcon);
export const GitFork = /* @__PURE__ */ appIcon("GitFork", GitForkIcon);
export const GitMerge = /* @__PURE__ */ appIcon("GitMerge", GitMergeIcon);
export const Globe = /* @__PURE__ */ appIcon("Globe", GlobeIcon);
export const Globe2 = /* @__PURE__ */ appIcon("Globe2", GlobeIcon);
export const Grid2X2 = /* @__PURE__ */ appIcon("Grid2X2", Grid2X2Icon);
export const GripVertical = /* @__PURE__ */ appIcon("GripVertical", Drag01Icon);
export const HardDrive = /* @__PURE__ */ appIcon("HardDrive", HardDriveIcon);
export const Heart = /* @__PURE__ */ appIcon("Heart", FavouriteIcon);
export const History = /* @__PURE__ */ appIcon("History", WorkHistoryIcon);
export const House = /* @__PURE__ */ appIcon("House", Home01Icon);
export const Image = /* @__PURE__ */ appIcon("Image", Image01Icon);
export const ImageOff = /* @__PURE__ */ appIcon("ImageOff", ImageNotFound01Icon);
export const ImagePlus = /* @__PURE__ */ appIcon("ImagePlus", ImageAdd01Icon);
export const Images = /* @__PURE__ */ appIcon("Images", Image02Icon);
export const Inbox = /* @__PURE__ */ appIcon("Inbox", InboxIcon);
export const Info = /* @__PURE__ */ appIcon("Info", InformationCircleIcon);
export const Instagram = /* @__PURE__ */ appIcon("Instagram", InstagramIcon);
export const KeyRound = /* @__PURE__ */ appIcon("KeyRound", Key02Icon);
export const Keyboard = /* @__PURE__ */ appIcon("Keyboard", KeyboardIcon);
export const Layers = /* @__PURE__ */ appIcon("Layers", Layers01Icon);
export const Layers3 = /* @__PURE__ */ appIcon("Layers3", Layers01Icon);
export const LayoutDashboard = /* @__PURE__ */ appIcon("LayoutDashboard", DashboardSquare01Icon);
export const LayoutGrid = /* @__PURE__ */ appIcon("LayoutGrid", LayoutGridIcon);
export const LayoutTemplate = /* @__PURE__ */ appIcon("LayoutTemplate", Layout01Icon);
export const Library = /* @__PURE__ */ appIcon("Library", LibraryIcon);
export const Lightbulb = /* @__PURE__ */ appIcon("Lightbulb", BulbIcon);
export const Linkedin = /* @__PURE__ */ appIcon("Linkedin", Linkedin02Icon);
export const List = /* @__PURE__ */ appIcon("List", ListViewIcon);
export const ListChecks = /* @__PURE__ */ appIcon("ListChecks", CheckListIcon);
export const ListFilter = /* @__PURE__ */ appIcon("ListFilter", FilterIcon);
export const ListTodo = /* @__PURE__ */ appIcon("ListTodo", CheckListIcon);
export const LoaderCircle = /* @__PURE__ */ appIcon("LoaderCircle", Loading03Icon);
export const LocateFixed = /* @__PURE__ */ appIcon("LocateFixed", Gps02Icon);
export const Lock = /* @__PURE__ */ appIcon("Lock", LockIcon);
export const LockKeyhole = /* @__PURE__ */ appIcon("LockKeyhole", LockKeyIcon);
export const LogIn = /* @__PURE__ */ appIcon("LogIn", Login01Icon);
export const Magnet = /* @__PURE__ */ appIcon("Magnet", MagnetIcon);
export const Maximize2 = /* @__PURE__ */ appIcon("Maximize2", ArrowExpand01Icon);
export const MessageCircle = /* @__PURE__ */ appIcon("MessageCircle", BubbleChatIcon);
export const MessageSquare = /* @__PURE__ */ appIcon("MessageSquare", Message01Icon);
export const MessageSquareText = /* @__PURE__ */ appIcon("MessageSquareText", Message02Icon);
export const Mic = /* @__PURE__ */ appIcon("Mic", Mic01Icon);
export const Minimize2 = /* @__PURE__ */ appIcon("Minimize2", ArrowShrink02Icon);
export const Minus = /* @__PURE__ */ appIcon("Minus", MinusSignIcon);
export const MoreHorizontal = /* @__PURE__ */ appIcon("MoreHorizontal", MoreHorizontalIcon);
export const MoreVertical = /* @__PURE__ */ appIcon("MoreVertical", MoreVerticalIcon);
export const MoveDiagonal2 = /* @__PURE__ */ appIcon("MoveDiagonal2", MoveDiagonal01Icon);
export const Music2 = /* @__PURE__ */ appIcon("Music2", MusicNote02Icon);
export const Package = /* @__PURE__ */ appIcon("Package", PackageIcon);
export const PackageCheck = /* @__PURE__ */ appIcon("PackageCheck", PackageDeliveredIcon);
export const Palette = /* @__PURE__ */ appIcon("Palette", PaintBoardIcon);
export const PanelLeft = /* @__PURE__ */ appIcon("PanelLeft", PanelLeftIcon);
export const PanelLeftClose = /* @__PURE__ */ appIcon("PanelLeftClose", PanelLeftCloseIcon);
export const PanelLeftOpen = /* @__PURE__ */ appIcon("PanelLeftOpen", PanelLeftOpenIcon);
export const PanelRight = /* @__PURE__ */ appIcon("PanelRight", PanelRightIcon);
export const PanelRightClose = /* @__PURE__ */ appIcon("PanelRightClose", PanelRightCloseIcon);
export const PanelRightOpen = /* @__PURE__ */ appIcon("PanelRightOpen", PanelRightOpenIcon);
export const PanelsTopLeft = /* @__PURE__ */ appIcon("PanelsTopLeft", PanelsTopLeftIcon);
export const Pause = /* @__PURE__ */ appIcon("Pause", PauseIcon);
export const PenTool = /* @__PURE__ */ appIcon("PenTool", PenTool01Icon);
export const Pencil = /* @__PURE__ */ appIcon("Pencil", PencilIcon);
export const PencilLine = /* @__PURE__ */ appIcon("PencilLine", PencilEdit01Icon);
export const Pilcrow = /* @__PURE__ */ appIcon("Pilcrow", ParagraphIcon);
export const Pin = /* @__PURE__ */ appIcon("Pin", PinIcon);
export const Pinterest = /* @__PURE__ */ appIcon("Pinterest", PinterestIcon);
export const Play = /* @__PURE__ */ appIcon("Play", PlayIcon);
export const Plug = /* @__PURE__ */ appIcon("Plug", Plug01Icon);
export const Plus = /* @__PURE__ */ appIcon("Plus", Add01Icon);
export const Radio = /* @__PURE__ */ appIcon("Radio", RadioIcon);
export const Redo2 = /* @__PURE__ */ appIcon("Redo2", Redo02Icon);
export const RefreshCw = /* @__PURE__ */ appIcon("RefreshCw", RefreshIcon);
export const Repeat = /* @__PURE__ */ appIcon("Repeat", RepeatIcon);
export const Repeat2 = /* @__PURE__ */ appIcon("Repeat2", RepeatIcon);
export const Rewind = /* @__PURE__ */ appIcon("Rewind", Backward01Icon);
export const RotateCcw = /* @__PURE__ */ appIcon("RotateCcw", RotateCcwIcon);
export const RotateCw = /* @__PURE__ */ appIcon("RotateCw", RotateCwIcon);
export const Save = /* @__PURE__ */ appIcon("Save", FloppyDiskIcon);
export const Scan = /* @__PURE__ */ appIcon("Scan", ScanIcon);
export const Scissors = /* @__PURE__ */ appIcon("Scissors", ScissorIcon);
export const ScrollText = /* @__PURE__ */ appIcon("ScrollText", ScrollIcon);
export const Search = /* @__PURE__ */ appIcon("Search", Search01Icon);
export const Send = /* @__PURE__ */ appIcon("Send", SentIcon);
export const Settings = /* @__PURE__ */ appIcon("Settings", Settings01Icon);
export const Settings2 = /* @__PURE__ */ appIcon("Settings2", Settings02Icon);
export const Share2 = /* @__PURE__ */ appIcon("Share2", Share02Icon);
export const Shield = /* @__PURE__ */ appIcon("Shield", Shield01Icon);
export const ShieldCheck = /* @__PURE__ */ appIcon("ShieldCheck", SecurityCheckIcon);
export const Shuffle = /* @__PURE__ */ appIcon("Shuffle", ShuffleIcon);
export const Signal = /* @__PURE__ */ appIcon("Signal", SignalIcon);
export const SkipBack = /* @__PURE__ */ appIcon("SkipBack", PreviousIcon);
export const SkipForward = /* @__PURE__ */ appIcon("SkipForward", NextIcon);
export const SlidersHorizontal = /* @__PURE__ */ appIcon("SlidersHorizontal", SlidersHorizontalIcon);
export const Sparkles = /* @__PURE__ */ appIcon("Sparkles", SparklesIcon);
export const Split = /* @__PURE__ */ appIcon("Split", SplitIcon);
export const Square = /* @__PURE__ */ appIcon("Square", SquareIcon);
export const SquareDashed = /* @__PURE__ */ appIcon("SquareDashed", SquareDashedIcon);
export const StickyNote = /* @__PURE__ */ appIcon("StickyNote", StickyNote01Icon);
export const Store = /* @__PURE__ */ appIcon("Store", Store01Icon);
export const Terminal = /* @__PURE__ */ appIcon("Terminal", ComputerTerminal01Icon);
export const ThumbsDown = /* @__PURE__ */ appIcon("ThumbsDown", ThumbsDownIcon);
export const ThumbsUp = /* @__PURE__ */ appIcon("ThumbsUp", ThumbsUpIcon);
export const Tiktok = /* @__PURE__ */ appIcon("Tiktok", TiktokIcon);
export const Trash2 = /* @__PURE__ */ appIcon("Trash2", Delete02Icon);
export const TriangleAlert = /* @__PURE__ */ appIcon("TriangleAlert", Alert01Icon);
export const Twitter = /* @__PURE__ */ appIcon("Twitter", NewTwitterIcon);
export const Type = /* @__PURE__ */ appIcon("Type", TextIcon);
export const Undo2 = /* @__PURE__ */ appIcon("Undo2", Undo02Icon);
export const Unlock = /* @__PURE__ */ appIcon("Unlock", SquareUnlock01Icon);
export const Unplug = /* @__PURE__ */ appIcon("Unplug", UnplugIcon);
export const Upload = /* @__PURE__ */ appIcon("Upload", Upload01Icon);
export const User = /* @__PURE__ */ appIcon("User", UserIcon);
export const UserRound = /* @__PURE__ */ appIcon("UserRound", UserCircleIcon);
export const UsersRound = /* @__PURE__ */ appIcon("UsersRound", UserGroupIcon);
export const Volume2 = /* @__PURE__ */ appIcon("Volume2", VolumeHighIcon);
export const VolumeX = /* @__PURE__ */ appIcon("VolumeX", VolumeMute01Icon);
export const WandSparkles = /* @__PURE__ */ appIcon("WandSparkles", MagicWand01Icon);
export const Waves = /* @__PURE__ */ appIcon("Waves", WaveIcon);
export const Wifi = /* @__PURE__ */ appIcon("Wifi", Wifi01Icon);
export const Workflow = /* @__PURE__ */ appIcon("Workflow", WorkflowCircle01Icon);
export const Wrench = /* @__PURE__ */ appIcon("Wrench", Wrench01Icon);
export const X = /* @__PURE__ */ appIcon("X", Cancel01Icon);
export const Youtube = /* @__PURE__ */ appIcon("Youtube", YoutubeIcon);
export const ZoomIn = /* @__PURE__ */ appIcon("ZoomIn", ZoomInIcon);
export const ZoomOut = /* @__PURE__ */ appIcon("ZoomOut", ZoomOutIcon);
