import paramiko
import time
import sys

def run_command(ssh, command):
    print(f"\n--- Executing: {command} ---")
    stdin, stdout, stderr = ssh.exec_command(command)
    
    # Read output in real-time with safe encoding
    while not stdout.channel.exit_status_ready():
        if stdout.channel.recv_ready():
            try:
                line = stdout.channel.recv(1024).decode('utf-8', errors='replace')
                sys.stdout.buffer.write(line.encode('utf-8'))
                sys.stdout.flush()
            except Exception as e:
                pass
    
    # Final output check
    try:
        final_out = stdout.read().decode('utf-8', errors='replace')
        sys.stdout.buffer.write(final_out.encode('utf-8'))
        sys.stdout.flush()
    except:
        pass
        
    err = stderr.read().decode('utf-8', errors='replace')
    if err:
        print(f"\nERROR/STDERR: {err}")

def main():
    host = "193.106.196.11"
    user = "root"
    password = "aHxV36vnKJjuNE"
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password)
    
    remote_base = "/root/kdl_bd"
    
    print("Checking if Docker is installed...")
    # The previous run might have finished or failed midway.
    # We will run setup again, it's idempotent.
    run_command(client, f"cd {remote_base} && chmod +x setup_vps.sh && ./setup_vps.sh")
    
    print("\nWaiting for containers to be fully up...")
    time.sleep(20)
    
    print("\nRunning data migration...")
    run_command(client, f"cd {remote_base} && docker compose exec -T api node src/migrate.js")
    
    print("\nFinal check: API status")
    run_command(client, "curl -s http://localhost:3000/api/doctors | head -n 5")
    
    print("\n✅ Setup complete!")
    client.close()

if __name__ == "__main__":
    main()
