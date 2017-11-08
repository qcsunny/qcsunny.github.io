---
title: 树莓派-编译内核
categories:
  - Linux
  - Kernel
tags:
  - Linux
  - Kernel
  - Compile
comments: true
date: 2017-11-07 14:27:16
top:
sticky:
password:
---
编译内核
```bash
git clone -b rpi-4.9.y --depth=1 https://github.com/raspberrypi/linux /usr/src/kernels/rpi-4.9/     //-b指定分支，这里选4.9；--depth=1只克隆最新版本
cd /usr/src/kernels/rpi-4.9/
sudo make menuconfig
make all    //编译后的文件放在当前目录
make modules_install    //安装内核模块/lib/modules
```
<!-- more -->

有三个重要的目录或文件，`kernel7.img``modules/*``dts/*`,将其复制到/boot下
```bash
sudo cp kernel7.img /boot/
sudo cp modules/4.9* /lib/modules
sudo cp dts/*.dtb /boot/
sudo cp dts/overlays/*.dtb* /boot/overlays/
sudo cp dts/overlays/README /boot/overlays/
```

报错1：
```bash
In file included from scripts/kconfig/mconf.c:23:0:
scripts/kconfig/lxdialog/dialog.h:38:20: fatal error: curses.h: No such file or directory
 #include CURSES_LOC
                    ^
compilation terminated.
scripts/Makefile.host:124: recipe for target 'scripts/kconfig/mconf.o' failed
make[1]: *** [scripts/kconfig/mconf.o] Error 1
Makefile:546: recipe for target 'menuconfig' failed
make: *** [menuconfig] Error 2
```
解释：缺少ncurses dev工具
解决： sudo aptitude install libncurses5-dev

报错2：
```bash
/bin/sh: 1: bc: not found
Kbuild:67: recipe for target 'include/generated/timeconst.h' failed
make[1]: *** [include/generated/timeconst.h] Error 127
Makefile:1036: recipe for target 'prepare0' failed
make: *** [prepare0] Error 2
```
解释：没安装bc这个高精确度数学运算工具
解决：sudo aptitude install bc

常用命令：
```
make mrproper    //会把以前进行过的内核功能文件也删除掉，几乎只有在第一次执行内核编译前才会进行这个操作
make clean    //仅会删除类似目标文件之类的编译过程产生的中间文件，而不会删除配置文件
make vmlinux    //未经压缩的内核；常见的/boot下的内核文件都是经过压缩的
make bzImage    //编译内核，经过压缩的内核
make modules    //编译内核模块
make all    //进行上述三个操作
```
