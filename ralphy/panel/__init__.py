"""`ralphy panel`: a local web page over the plain files in `RALPHY_HOME`.

Two sections, Content and Accounts (with Schedule inside), plus Trends reached from Content. The server
(`server.py`) reads the same files the CLI writes, serves media with byte ranges, plays the working tree and
every saved version live through the HyperFrames player, and pushes file changes to the page over Server-Sent
Events. It writes only on a person's click: approving or cancelling a planned post. `launch.py` starts it in
the background and finds it again.
"""
