Notes:
------

- IRC adapter creates one TCP socket per user per IRC server. On
  Linux, if you have many users you might need to adjust the file
  descriptor limit in /etc/security/limits.conf and relogin.
